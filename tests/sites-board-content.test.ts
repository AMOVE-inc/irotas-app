import { describe, expect, it } from "vitest";
import {
  canAccessBoardCategory,
  discordAuthorFallbackFor,
  handleBoardContentRequest,
} from "../sites/board-content";
import type {
  D1Database,
  D1PreparedStatement,
  SitesEnv,
} from "../sites/platform-types";

type Member = {
  id: number;
  role: "user" | "operator" | "admin";
  access_role: "member" | "club_leader" | "operator" | "admin";
  account_status: "active";
};

function testDatabase(
  member: Member,
  clubAllowed = false,
  recentIntroduction?: { id: string; created_at: string },
) {
  const writes: { sql: string; values: unknown[] }[] = [];
  const db: D1Database = {
    prepare(sql) {
      let values: unknown[] = [];
      const statement: D1PreparedStatement = {
        bind(...next) {
          values = next;
          return statement;
        },
        async first<T>() {
          if (sql.includes("FROM member_sessions")) {
            return {
              ...member,
              email: "member@example.com",
              password_hash: null,
              display_name: "テスト会員",
              branches_json: "[]",
              last_signed_in_at: null,
              public_member_id: "IRO0099",
              member_term: "1期生",
              member_rank: "regular",
              discord_roles_json: "[]",
              achievement_badges_json: "[]",
              profile_json: "{}",
              xp: 0,
              participation_count: 0,
              organizer_count: 0,
              subscription_started_at: "2026-01-01",
              billing_email: "member@example.com",
              square_status: "ACTIVE",
              access_status: "active",
              paid_until_date: null,
              grace_until_date: null,
            } as T;
          }
          if (sql.includes("SELECT 1 AS allowed"))
            return (clubAllowed ? { allowed: 1 } : null) as T | null;
          if (sql.includes("category = 'introduction'"))
            return (recentIntroduction ?? null) as T | null;
          return null;
        },
        async run() {
          writes.push({ sql, values });
          return { success: true };
        },
        async all() {
          return { success: true, results: [] };
        },
      };
      return statement;
    },
    async batch() {
      return [];
    },
  };
  return { db, writes };
}

function request(path: string, method: string, body?: unknown) {
  return new Request(`https://app.example${path}`, {
    method,
    headers: {
      cookie: "__Host-irotas_session=test-session",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("shared board content API", () => {
  it("restores a Discord board author's rank and avatar when no linked member row exists", () => {
    expect(discordAuthorFallbackFor("696624208532340756")).toMatchObject({
      displayName: "ゆい",
      memberRank: "gold",
      avatarUrl: expect.stringContaining("696624208532340756"),
    });
  });

  it("requires an authenticated member", async () => {
    const { db } = testDatabase({ id: 1, role: "user", access_role: "member", account_status: "active" });
    const response = await handleBoardContentRequest(
      new Request("https://app.example/api/board/content"),
      { DB: db } as SitesEnv,
    );
    expect(response?.status).toBe(401);
  });

  it("persists a valid public thread and writes an audit record", async () => {
    const { db, writes } = testDatabase({ id: 9, role: "user", access_role: "member", account_status: "active" });
    const response = await handleBoardContentRequest(
      request("/api/board/threads", "POST", {
        category: "free-chat",
        title: "東京のお店を教えてください",
        content: "おすすめを募集しています。",
        status: "open",
        data: { genres: ["和食"] },
      }),
      { DB: db } as SitesEnv,
    );
    expect(response?.status).toBe(201);
    expect(writes.some((item) => item.sql.includes("INSERT INTO board_threads"))).toBe(true);
    expect(writes.some((item) => item.sql.includes("INSERT INTO audit_logs"))).toBe(true);
  });

  it("returns the recent self-introduction instead of creating it twice", async () => {
    const existing = { id: "intro-existing", created_at: "2026-08-28T01:00:00.000Z" };
    const { db, writes } = testDatabase(
      { id: 9, role: "user", access_role: "member", account_status: "active" },
      false,
      existing,
    );
    const response = await handleBoardContentRequest(
      request("/api/board/threads", "POST", {
        category: "introduction",
        title: "自己紹介",
        content: "はじめまして。よろしくお願いします。",
        status: "none",
      }),
      { DB: db } as SitesEnv,
    );
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({ id: existing.id, duplicate: true });
    expect(writes.some((item) => item.sql.includes("INSERT INTO board_threads"))).toBe(false);
  });

  it.each(["meal-report", "gourmet-advice"])("accepts the app category %s", async (category) => {
    const { db } = testDatabase({ id: 9, role: "user", access_role: "member", account_status: "active" });
    const response = await handleBoardContentRequest(
      request("/api/board/threads", "POST", { category, title: "投稿", content: "本文", status: "none" }),
      { DB: db } as SitesEnv,
    );
    expect(response?.status).toBe(201);
  });

  it("allows only operators to create gourmet contests", async () => {
    const general = testDatabase({ id: 9, role: "user", access_role: "member", account_status: "active" });
    const denied = await handleBoardContentRequest(
      request("/api/board/threads", "POST", {
        category: "gourmet-contest",
        title: "第25回カレー選手権",
        content: "おすすめを投稿してください。",
      }),
      { DB: general.db } as SitesEnv,
    );
    expect(denied?.status).toBe(403);
    expect(general.writes.some((item) => item.sql.includes("INSERT INTO board_threads"))).toBe(false);

    const operator = testDatabase({ id: 10, role: "operator", access_role: "operator", account_status: "active" });
    const allowed = await handleBoardContentRequest(
      request("/api/board/threads", "POST", {
        category: "gourmet-contest",
        title: "第25回カレー選手権",
        content: "おすすめを投稿してください。",
      }),
      { DB: operator.db } as SitesEnv,
    );
    expect(allowed?.status).toBe(201);
  });

  it("blocks private club categories until membership is approved", async () => {
    const member = { id: 9, role: "user", access_role: "member", account_status: "active" } as const;
    const denied = testDatabase(member, false);
    await expect(canAccessBoardCategory(denied.db, "club-club-bread", member)).resolves.toBe(false);
    const allowed = testDatabase(member, true);
    await expect(canAccessBoardCategory(allowed.db, "club-club-bread", member)).resolves.toBe(true);
  });

  it("materializes a known Discord thread before accepting new shared comments", async () => {
    const { db, writes } = testDatabase({ id: 9, role: "user", access_role: "member", account_status: "active" });
    const response = await handleBoardContentRequest(
      request("/api/board/imported-threads/discord-board-1537685822852173907/ensure", "POST"),
      { DB: db } as SitesEnv,
    );
    expect(response?.status).toBe(200);
    expect(writes.some((item) => item.sql.includes("INSERT OR IGNORE INTO board_threads"))).toBe(true);
  });

  it("rejects unknown imported thread identifiers", async () => {
    const { db } = testDatabase({ id: 9, role: "user", access_role: "member", account_status: "active" });
    const response = await handleBoardContentRequest(
      request("/api/board/imported-threads/discord-board-9999999999999999999/ensure", "POST"),
      { DB: db } as SitesEnv,
    );
    expect(response?.status).toBe(404);
  });
});
