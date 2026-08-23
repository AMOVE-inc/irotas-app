import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticatedRequestMember } = vi.hoisted(() => ({
  authenticatedRequestMember: vi.fn(),
}));

vi.mock("../sites/auth", () => ({ authenticatedRequestMember }));
vi.mock("../sites/clubs", () => ({ canMemberAccessClub: vi.fn() }));

import { handleChatContentRequest } from "../sites/chat-content";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

type Message = {
  id: string;
  room_id: string;
  sender_member_id: number;
  sender_public_member_id: string;
  sender_display_name: string;
  content: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

class ChatDatabase implements D1Database {
  messages: Message[] = [];
  writes: string[] = [];
  memberRank = "regular";

  prepare(sql: string): D1PreparedStatement {
    let values: unknown[] = [];
    const statement: D1PreparedStatement = {
      bind: (...next) => { values = next; return statement; },
      first: async <T>() => {
        if (sql.includes("FROM chat_rooms")) {
          const id = String(values[0]);
          if (id === "board-announcement") return {
            id, name: "運営アナウンス", room_type: "announcement", source_id: "announcement",
            required_rank: null, created_by_member_id: null,
          } as T;
          if (id === "rank-gold") return {
            id, name: "ゴールドメンバールーム", room_type: "rank", source_id: id,
            required_rank: "gold", created_by_member_id: null,
          } as T;
          return null;
        }
        if (sql.includes("SELECT member_rank FROM members")) return { member_rank: this.memberRank } as T;
        return null;
      },
      all: async <T>() => {
        if (sql.includes("FROM chat_messages cm JOIN members"))
          return { success: true, results: this.messages as T[] };
        return { success: true, results: [] as T[] };
      },
      run: async () => {
        this.writes.push(sql);
        if (sql.includes("INSERT INTO chat_messages")) {
          this.messages.push({
            id: String(values[0]), room_id: String(values[1]), sender_member_id: Number(values[2]),
            sender_public_member_id: "IRO0099", sender_display_name: "運営テスト",
            content: String(values[3]), image_url: values[4] ? String(values[4]) : null,
            created_at: String(values[5]), updated_at: String(values[6]),
          });
        }
        return { success: true };
      },
    };
    return statement;
  }

  async batch<T>(statements: D1PreparedStatement[]) {
    return Promise.all(statements.map((statement) => statement.run())) as Promise<T[]>;
  }
}

const request = (path: string, method = "GET", body?: unknown) => new Request(`https://app.example${path}`, {
  method,
  headers: body ? { "content-type": "application/json" } : undefined,
  body: body ? JSON.stringify(body) : undefined,
});

describe("shared chat content API", () => {
  let db: ChatDatabase;
  let env: SitesEnv;

  beforeEach(() => {
    db = new ChatDatabase();
    env = { DB: db } as unknown as SitesEnv;
    authenticatedRequestMember.mockResolvedValue({ id: 9, role: "user", access_role: "member", account_status: "active" });
  });

  it("requires login and lets authenticated members read announcements", async () => {
    authenticatedRequestMember.mockResolvedValueOnce(null);
    expect((await handleChatContentRequest(request("/api/chats/board-announcement/messages"), env))?.status).toBe(401);
    const allowed = await handleChatContentRequest(request("/api/chats/board-announcement/messages"), env);
    expect(allowed?.status).toBe(200);
  });

  it("keeps announcements operator-only for posting", async () => {
    const denied = await handleChatContentRequest(request("/api/chats/board-announcement/messages", "POST", { content: "一般会員の投稿" }), env);
    expect(denied?.status).toBe(403);

    authenticatedRequestMember.mockResolvedValue({ id: 9, role: "operator", access_role: "operator", account_status: "active" });
    const allowed = await handleChatContentRequest(request("/api/chats/board-announcement/messages", "POST", { content: "運営からのお知らせ" }), env);
    expect(allowed?.status).toBe(201);
    const body = await allowed?.json() as { message: Record<string, unknown> };
    expect(body.message).toMatchObject({ content: "運営からのお知らせ", senderId: "IRO0099", shared: true });
    expect(db.writes.some((sql) => sql.includes("INSERT INTO audit_logs"))).toBe(true);
  });

  it("allows only members of the matching rank room", async () => {
    db.memberRank = "regular";
    const denied = await handleChatContentRequest(request("/api/chats/rank-gold/messages"), env);
    expect(denied?.status).toBe(403);
    db.memberRank = "gold";
    const allowed = await handleChatContentRequest(request("/api/chats/rank-gold/messages"), env);
    expect(allowed?.status).toBe(200);
  });
});
