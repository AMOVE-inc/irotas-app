import { describe, expect, it } from "vitest";
import { handleReviewAccountRequest } from "../sites/review-account";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

type Role = "member" | "admin";

function database(role: Role, current: Record<string, unknown> | null = null) {
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const prepare = (sql: string): D1PreparedStatement => {
    let values: unknown[] = [];
    const statement: D1PreparedStatement = {
      bind: (...next) => { values = next; return statement; },
      first: async <T>() => {
        if (sql.includes("FROM member_sessions ms")) return {
          id: 1, email: "admin@example.com", password_hash: "hash", display_name: "管理者",
          role: role === "admin" ? "admin" : "user", access_role: role,
          branches_json: '["kanto"]', account_status: "active", public_member_id: "IRO0001",
          member_term: null, member_rank: "regular", discord_roles_json: "[]",
          achievement_badges_json: "[]", profile_json: "{}", xp: 0,
          participation_count: 0, organizer_count: 0, billing_email: "admin@example.com",
          square_status: "ACTIVE", access_status: "active",
        } as T;
        if (sql.includes("json_extract(profile_json")) return current as T;
        if (sql.includes("FROM members WHERE email = ?")) return null;
        if (sql.includes("RETURNING id")) {
          writes.push({ sql, values });
          return { id: 77 } as T;
        }
        return null;
      },
      all: async <T>() => ({ success: true, results: [] as T[] }),
      run: async () => { writes.push({ sql, values }); return { success: true }; },
    };
    Object.assign(statement, { __sql: sql, __values: () => values });
    return statement;
  };
  const db: D1Database = {
    prepare,
    batch: async (statements) => {
      for (const statement of statements as Array<D1PreparedStatement & { __sql: string; __values: () => unknown[] }>) {
        writes.push({ sql: statement.__sql, values: statement.__values() });
      }
      return statements.map(() => ({ success: true }));
    },
  };
  return { db, writes };
}

function request(method = "GET", body?: unknown) {
  return new Request("https://app.example/api/admin/review-account", {
    method,
    headers: {
      authorization: "Bearer admin-session",
      origin: "https://app.example",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("store review account", () => {
  it("allows administrators only", async () => {
    const store = database("member");
    const response = await handleReviewAccountRequest(request(), { DB: store.db, AUTH_SECRET: "secret" } as SitesEnv);
    expect(response?.status).toBe(403);
  });

  it("rejects weak temporary passwords", async () => {
    const store = database("admin");
    const response = await handleReviewAccountRequest(request("PUT", {
      email: "review@example.com", displayName: "審査用", password: "short",
    }), { DB: store.db, AUTH_SECRET: "secret" } as SitesEnv);
    expect(response?.status).toBe(400);
  });

  it("creates an isolated general-member account without storing plaintext credentials", async () => {
    const store = database("admin");
    const password = "ReviewPassword2026";
    const response = await handleReviewAccountRequest(request("PUT", {
      email: "review@example.com", displayName: "審査用", password,
    }), { DB: store.db, AUTH_SECRET: "secret" } as SitesEnv);
    expect(response?.status).toBe(200);
    const joinedSql = store.writes.map((write) => write.sql).join("\n");
    const values = store.writes.flatMap((write) => write.values);
    expect(joinedSql).toContain("'user', 'member'");
    expect(joinedSql).toContain("'REVIEW_ACCOUNT'");
    expect(joinedSql).toContain("square_customer_id = NULL");
    expect(joinedSql).toContain("DELETE FROM member_sessions");
    expect(values).not.toContain(password);
    expect(values.some((value) => typeof value === "string" && value.startsWith("pbkdf2"))).toBe(true);
  });

  it("suspends the review account and invalidates its sessions", async () => {
    const current = {
      id: 77, email: "review@example.com", display_name: "審査用", account_status: "active",
      profile_json: '{"isTestAccount":true,"isReviewAccount":true}', updated_at: "2026-08-24T00:00:00.000Z",
    };
    const store = database("admin", current);
    const response = await handleReviewAccountRequest(request("DELETE"), { DB: store.db, AUTH_SECRET: "secret" } as SitesEnv);
    expect(response?.status).toBe(200);
    expect(store.writes.some((write) => write.sql.includes("DELETE FROM member_sessions"))).toBe(true);
    expect(store.writes.some((write) => write.sql.includes("account_status = 'suspended'"))).toBe(true);
  });
});
