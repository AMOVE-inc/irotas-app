import { describe, expect, it } from "vitest";
import {
  canAccessBoardCategory,
  discordAuthorFallbackFor,
  handleBoardContentRequest,
} from "../sites/board-content";
import { handleBoardArchiveRequest } from "../sites/board-archive";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  SitesEnv,
} from "../sites/platform-types";

type Member = {
  id: number;
  role: "user" | "operator" | "admin";
  access_role: "member" | "club_leader" | "operator" | "admin";
  account_status: "active";
  discord_user_id?: string;
};

function testDatabase(
  member: Member,
  clubAllowed = false,
  recentIntroduction?: { id: string; created_at: string },
  thread?: { id: string; author_member_id: number; category: string; title: string },
  replyComment?: { id: string; threadId: string; content: string; displayName: string },
  clubLeader = false,
  contentThread?: { id: string; category: string },
  deletedArchivedCommentIds: string[] = [],
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
          if (sql.includes("SELECT discord_user_id FROM members WHERE id = ?"))
            return { discord_user_id: member.discord_user_id ?? null } as T;
          if (sql.includes("FROM clubs\n    WHERE id = ? AND leader_member_id = ?"))
            return (clubLeader ? { allowed: 1 } : null) as T | null;
          if (sql.includes("WHERE name = ? AND leader_member_id = ?"))
            return (clubLeader && values[0] === "料理教室部" ? { allowed: 1 } : null) as T | null;
          if (sql.includes("SELECT 1 AS allowed"))
            return (clubAllowed ? { allowed: 1 } : null) as T | null;
          if (sql.includes("category = 'introduction'"))
            return (recentIntroduction ?? null) as T | null;
          if (sql.includes("FROM board_threads WHERE id = ?"))
            return (thread ?? null) as T | null;
          if (sql.includes("SELECT display_name FROM members"))
            return { display_name: "テスト会員" } as T;
          if (sql.includes("SELECT bc.content, m.display_name FROM board_comments bc")) {
            if (replyComment && replyComment.id === values[0] && replyComment.threadId === values[1])
              return { content: replyComment.content, display_name: replyComment.displayName } as T;
            return null;
          }
          return null;
        },
        async run() {
          writes.push({ sql, values });
          return { success: true };
        },
        async all<T>() {
          if (sql.includes("SELECT id FROM board_comments WHERE deleted_at IS NOT NULL"))
            return { success: true, results: deletedArchivedCommentIds.map((id) => ({ id } as T)) };
          if (contentThread && sql.includes("WHERE bt.id = ? AND bt.category = ?") &&
              values[0] === contentThread.id && values[1] === contentThread.category)
            return { success: true, results: [{
              id: contentThread.id, category: contentThread.category, author_member_id: member.id,
              author_public_member_id: "IRO0099", author_display_name: "テスト会員",
              author_member_term: "1期生", author_member_rank: "regular", author_profile_json: "{}",
              title: "対象の投稿", content: "投稿本文", status: "open", pinned: 0,
              data_json: "{}", created_at: "2026-09-19T01:00:00.000Z", updated_at: "2026-09-19T01:00:00.000Z",
            }] } as D1Result<T>;
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
  it("resolves a shared thread title and enforces private club access", async () => {
    const member = { id: 9, role: "user", access_role: "member", account_status: "active" } as const;
    const publicThread = { id: "thread-1", author_member_id: 10, category: "free-chat", title: "料理教室の募集" };
    const publicDb = testDatabase(member, false, undefined, publicThread);
    const title = await handleBoardContentRequest(request("/api/board/threads/thread-1", "GET"), { DB: publicDb.db } as SitesEnv);
    expect(await title?.json()).toMatchObject({ title: "料理教室の募集" });
    const privateThread = { ...publicThread, category: "club-club-cooking-class" };
    const privateDb = testDatabase(member, false, undefined, privateThread);
    const denied = await handleBoardContentRequest(request("/api/board/threads/thread-1", "GET"), { DB: privateDb.db } as SitesEnv);
    expect(denied?.status).toBe(404);
  });
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

  it("records deletion of an imported gourmet advice comment in the shared database", async () => {
    const member = { id: 9, role: "admin", access_role: "admin", account_status: "active" } as const;
    const thread = { id: "discord-board-1543137666009272340", author_member_id: 10, category: "gourmet-advice", title: "おすすめのお店" };
    const { db, writes } = testDatabase(member, false, undefined, thread);
    const response = await handleBoardContentRequest(
      request("/api/board/comments/discord-comment-1543820885625012275", "DELETE"), { DB: db } as SitesEnv,
    );
    expect(response?.status).toBe(200);
    const tombstone = writes.find((item) => item.sql.includes("INSERT OR IGNORE INTO board_comments"));
    expect(tombstone?.values.slice(0, 3)).toEqual(["discord-comment-1543820885625012275", thread.id, member.id]);
    expect(tombstone?.values[7]).toBeTruthy();
  });

  it("rejects imported comment deletion by someone other than its author", async () => {
    const member = { id: 9, role: "user", access_role: "member", account_status: "active", discord_user_id: "999999999999999999" } as const;
    const { db, writes } = testDatabase(member);
    const response = await handleBoardContentRequest(
      request("/api/board/comments/discord-comment-1543820885625012275", "DELETE"), { DB: db } as SitesEnv,
    );
    expect(response?.status).toBe(403);
    expect(writes.some((item) => item.sql.includes("INSERT OR IGNORE INTO board_comments"))).toBe(false);
  });

  it("hides a deleted imported comment when the archive is loaded again", async () => {
    const member = { id: 9, role: "admin", access_role: "admin", account_status: "active" } as const;
    const deletedId = "discord-comment-1543820885625012275";
    const { db } = testDatabase(member, false, undefined, undefined, undefined, false, undefined, [deletedId]);
    const response = await handleBoardArchiveRequest(request("/api/board/archive", "GET"), { DB: db } as SitesEnv);
    expect(response?.status).toBe(200);
    const result = await response?.json() as { comments: { id: string }[] };
    expect(result.comments.some((comment) => comment.id === "1543820885625012275")).toBe(false);
  });

  it("loads a linked post by id even when it is outside the category list", async () => {
    const member = { id: 9, role: "user", access_role: "member", account_status: "active" } as const;
    const { db } = testDatabase(member, false, undefined, undefined, undefined, false, { id: "linked-post", category: "meal-report" });
    const response = await handleBoardContentRequest(
      request("/api/board/content?category=meal-report&thread=linked-post", "GET"),
      { DB: db } as SitesEnv,
    );
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ threads: [{ id: "linked-post", title: "対象の投稿" }] });

    const wrongCategory = await handleBoardContentRequest(
      request("/api/board/content?category=gourmet-advice&thread=linked-post", "GET"),
      { DB: db } as SitesEnv,
    );
    expect(await wrongCategory?.json()).toMatchObject({ threads: [] });
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

  it("preserves circled list numbers and multiline formatting in post text", async () => {
    const { db, writes } = testDatabase({ id: 9, role: "user", access_role: "member", account_status: "active" });
    const content = "**① 最初の項目\n② 次の項目**";
    const response = await handleBoardContentRequest(request("/api/board/threads", "POST", { category: "free-chat", title: "箇条書き", content }), { DB: db } as SitesEnv);
    expect(response?.status).toBe(201);
    expect(writes.find((item) => item.sql.includes("INSERT INTO board_threads"))?.values).toContain(content);
  });

  it("lets the assigned club leader change only the closed and pinned state", async () => {
    const member = { id: 9, role: "user", access_role: "club_leader", account_status: "active" } as const;
    const thread = {
      id: "club-post-1",
      author_member_id: 10,
      category: "club-club-cooking-class",
      title: "料理教室のお知らせ",
      content: "本文",
      status: "open" as const,
      pinned: 0,
      data_json: "{}",
    };
    const leaderDb = testDatabase(member, true, undefined, thread, undefined, true);
    const managementResponse = await handleBoardContentRequest(
      request("/api/board/threads/club-post-1", "PATCH", { status: "closed", pinned: true }),
      { DB: leaderDb.db } as SitesEnv,
    );
    expect(managementResponse?.status).toBe(200);
    expect(leaderDb.writes.some((item) => item.sql.includes("UPDATE board_threads SET title"))).toBe(true);

    const editDb = testDatabase(member, true, undefined, thread, undefined, true);
    const editResponse = await handleBoardContentRequest(
      request("/api/board/threads/club-post-1", "PATCH", { title: "勝手に変更" }),
      { DB: editDb.db } as SitesEnv,
    );
    expect(editResponse?.status).toBe(403);
  });

  it("does not let another club member manage someone else's post", async () => {
    const member = { id: 9, role: "user", access_role: "member", account_status: "active" } as const;
    const thread = {
      id: "club-post-1",
      author_member_id: 10,
      category: "club-club-cooking-class",
      title: "料理教室のお知らせ",
      content: "本文",
      status: "open" as const,
      pinned: 0,
      data_json: "{}",
    };
    const { db } = testDatabase(member, true, undefined, thread);
    const response = await handleBoardContentRequest(
      request("/api/board/threads/club-post-1", "PATCH", { status: "closed", pinned: true }),
      { DB: db } as SitesEnv,
    );
    expect(response?.status).toBe(403);
  });

  it("lets the assigned club leader edit and delete their club activity report", async () => {
    const member = { id: 9, role: "user", access_role: "club_leader", account_status: "active" } as const;
    const thread = {
      id: "discord-board-1548731641931899001",
      author_member_id: 10,
      category: "club-all",
      title: "【料理教室部】2026年9月 活動報告🍳",
      content: "本文",
      status: "none" as const,
      pinned: 0,
      data_json: "{}",
    };
    const editDb = testDatabase(member, false, undefined, thread, undefined, true);
    const edit = await handleBoardContentRequest(
      request(`/api/board/threads/${thread.id}`, "PATCH", { title: thread.title, content: "更新後" }),
      { DB: editDb.db } as SitesEnv,
    );
    expect(edit?.status).toBe(200);

    const deleteDb = testDatabase(member, false, undefined, thread, undefined, true);
    const deleted = await handleBoardContentRequest(
      request(`/api/board/threads/${thread.id}`, "DELETE"),
      { DB: deleteDb.db } as SitesEnv,
    );
    expect(deleted?.status).toBe(200);
  });

  it("notifies the post author when another member comments", async () => {
    const { db, writes } = testDatabase(
      { id: 9, role: "user", access_role: "member", account_status: "active" },
      false,
      undefined,
      { id: "post-1", author_member_id: 10, category: "meal-report", title: "おすすめのお店" },
    );
    const response = await handleBoardContentRequest(
      request("/api/board/threads/post-1/comments", "POST", { content: "ありがとうございます" }),
      { DB: db } as SitesEnv,
    );
    expect(response?.status).toBe(201);
    expect(writes.some((item) => item.sql.includes("INSERT OR IGNORE INTO in_app_notifications") && item.values.includes(10))).toBe(true);
  });

  it("accepts a media-only comment and describes it in the notification", async () => {
    const { db, writes } = testDatabase(
      { id: 9, role: "user", access_role: "member", account_status: "active" },
      false,
      undefined,
      { id: "post-1", author_member_id: 10, category: "free-chat", title: "投稿" },
    );
    const response = await handleBoardContentRequest(
      request("/api/board/threads/post-1/comments", "POST", { content: "", data: { videos: ["/api/event-images/video-1"] } }),
      { DB: db } as SitesEnv,
    );
    expect(response?.status).toBe(201);
    expect(writes.find((item) => item.sql.includes("INSERT INTO board_comments"))?.values[3]).toBe("");
    expect(writes.find((item) => item.sql.includes("INSERT OR IGNORE INTO in_app_notifications"))?.values).toContain("テスト会員: 写真・動画が届きました");
  });

  it("stores a verified reply preview from a comment in the same thread", async () => {
    const thread = { id: "post-1", author_member_id: 10, category: "free-chat", title: "投稿" };
    const source = { id: "comment-1", threadId: "post-1", content: "元のコメント", displayName: "投稿者" };
    const { db, writes } = testDatabase({ id: 9, role: "user", access_role: "member", account_status: "active" }, false, undefined, thread, source);
    const reply = await handleBoardContentRequest(request("/api/board/threads/post-1/comments", "POST", { content: "返信", data: { replyTo: { id: "comment-1", authorName: "偽の名前", excerpt: "偽の本文" } } }), { DB: db } as SitesEnv);
    expect(reply?.status).toBe(201);
    const saved = writes.find((item) => item.sql.includes("INSERT INTO board_comments"));
    expect(JSON.parse(String(saved?.values[4])).replyTo).toEqual({ id: "comment-1", authorName: "投稿者", excerpt: "元のコメント" });
    const invalid = await handleBoardContentRequest(request("/api/board/threads/post-1/comments", "POST", { content: "返信", data: { replyTo: { id: "other-thread" } } }), { DB: db } as SitesEnv);
    expect(invalid?.status).toBe(404);
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
