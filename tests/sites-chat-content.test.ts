import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleChatContentRequest } from "../sites/chat-content";
import { canMemberAccessClub } from "../sites/clubs";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

const { authenticatedRequestMember } = vi.hoisted(() => ({
  authenticatedRequestMember: vi.fn(),
}));

vi.mock("../sites/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("../sites/auth")>()), authenticatedRequestMember }));
vi.mock("../sites/clubs", () => ({ canMemberAccessClub: vi.fn() }));

type Message = {
  id: string;
  room_id: string;
  sender_member_id: number;
  sender_public_member_id: string;
  sender_display_name: string;
  sender_profile_json?: string;
  content: string;
  image_url: string | null;
  image_urls_json?: string;
  reply_to_json?: string | null;
  created_at: string;
  updated_at: string;
};

class ChatDatabase implements D1Database {
  messages: Message[] = [];
  writes: string[] = [];
  notifiedMemberIds: number[] = [];
  memberRank = "regular";
  discordRolesJson = "[]";
  approvedClubMemberIds = new Set([9]);
  clubs = [{ id: "club-travel", name: "旅行部", leader_member_id: 10 }];
  rooms = new Map<string, { id: string; name: string; room_type: string; source_id: string | null; required_rank: string | null; created_by_member_id: number | null }>([
    ["board-announcement", { id: "board-announcement", name: "運営アナウンス", room_type: "announcement", source_id: "announcement", required_rank: null, created_by_member_id: null }],
    ["rank-gold", { id: "rank-gold", name: "ゴールドメンバールーム", room_type: "rank", source_id: "rank-gold", required_rank: "gold", created_by_member_id: null }],
    ["branch-kanto-free", { id: "branch-kanto-free", name: "関東支部フリーチャット", room_type: "board", source_id: "branch-kanto-v2", required_rank: null, created_by_member_id: null }],
  ]);
  roomMembers: { roomId: string; memberId: number; role: string; left: boolean }[] = [];
  members = [
    { id: 9, public_member_id: "IRO0009", display_name: "テスト本人", branches_json: '["kanto"]', role: "user", access_role: "member" },
    { id: 10, public_member_id: "IRO0010", display_name: "友達A", branches_json: '["kanto"]', role: "user", access_role: "member" },
    { id: 11, public_member_id: "IRO0011", display_name: "友達B", branches_json: '["kansai"]', role: "user", access_role: "member" },
  ];

  prepare(sql: string): D1PreparedStatement {
    let values: unknown[] = [];
    const statement: D1PreparedStatement = {
      bind: (...next) => { values = next; return statement; },
      first: async <T>() => {
        if (sql.includes("COALESCE(password_set_at, last_signed_in_at) AS started_at"))
          return { display_name: this.members.find((item) => item.id === Number(values[0]))?.display_name ?? "", started_at: "2026-01-01" } as T;
        if (sql.includes("FROM clubs WHERE id = ? AND status = 'active'"))
          return (this.clubs.find((club) => club.id === values[0]) ?? null) as T;
        if (sql.includes("SELECT COUNT(*) AS count FROM member_follows")) return { count: 2 } as T;
        if (sql.includes("FROM members WHERE account_status = 'active'")) {
          return (this.members.find((member) => member.public_member_id === values[0] || member.id === Number(values[1])) ?? null) as T;
        }
        if (sql.includes("SELECT public_member_id FROM members WHERE id")) {
          const found = this.members.find((member) => member.id === Number(values[0]));
          return (found ? { public_member_id: found.public_member_id } : null) as T;
        }
        if (sql.includes("SELECT member_role FROM chat_room_members")) {
          const found = this.roomMembers.find((item) => item.roomId === values[0] && item.memberId === Number(values[1]) && !item.left);
          return (found ? { member_role: found.role } : null) as T;
        }
        if (sql.includes("SELECT 1 AS allowed FROM chat_room_members")) {
          const found = this.roomMembers.find((item) => item.roomId === values[0] && item.memberId === Number(values[1]) && !item.left);
          return (found ? { allowed: 1 } : null) as T;
        }
        if (sql.includes("SELECT 1 AS active FROM chat_room_members")) {
          const found = this.roomMembers.find((item) => item.roomId === values[0] && item.memberId === Number(values[1]) && !item.left);
          return (found ? { active: 1 } : null) as T;
        }
        if (sql.includes("SELECT 1 AS left FROM chat_room_members")) {
          const found = this.roomMembers.find((item) => item.roomId === values[0] && item.memberId === Number(values[1]) && item.left);
          return (found ? { left: 1 } : null) as T;
        }
        if (sql.includes("SELECT COUNT(*) AS count FROM chat_messages")) return { count: 0 } as T;
        if (sql.includes("SELECT content, image_url, created_at FROM chat_messages")) return null;
        if (sql.includes("SELECT cm.content, cm.image_url, m.display_name")) {
          const found = this.messages.find((message) => message.id === values[0] && message.room_id === values[1]);
          return (found ? { content: found.content, image_url: found.image_url, display_name: found.sender_display_name } : null) as T;
        }
        if (sql.includes("SELECT room_id, sender_member_id FROM chat_messages")) {
          const found = this.messages.find((message) => message.id === values[0]);
          return (found ? { room_id: found.room_id, sender_member_id: found.sender_member_id } : null) as T;
        }
        if (sql.includes("SELECT member_id FROM chat_room_members")) {
          const found = this.roomMembers.find((item) => item.roomId === values[0] && !item.left);
          return (found ? { member_id: found.memberId } : null) as T;
        }
        if (sql.includes("FROM chat_rooms")) {
          if (sql.includes("room_type = 'dm' AND source_id"))
            return ([...this.rooms.values()].find((room) => room.room_type === "dm" && room.source_id === values[0]) ?? null) as T;
          return (this.rooms.get(String(values[0])) ?? null) as T;
        }
        if (sql.includes("SELECT member_rank, discord_roles_json FROM members")) return { member_rank: this.memberRank, discord_roles_json: this.discordRolesJson } as T;
        if (sql.includes("SELECT branches_json FROM members WHERE id"))
          return (this.members.find((member) => member.id === Number(values[0])) ?? null) as T;
        return null;
      },
      all: async <T>() => {
        if (sql.includes("SELECT id, display_name, public_member_id, branches_json, role, access_role"))
          return { success: true, results: this.members.filter((member) => member.id !== Number(values[0])) as T[] };
        if (sql.includes("SELECT m.id AS member_id") && sql.includes("club_memberships cm")) {
          const memberIds = [...new Set([...this.approvedClubMemberIds, Number(values[0])])].filter(Number.isFinite);
          return { success: true, results: memberIds.map((memberId) => ({ member_id: memberId, member_role: memberId === values[0] ? "owner" : "member" })) as T[] };
        }
        if (sql.includes("SELECT member_id FROM chat_room_members") && sql.includes("left_at IS NULL"))
          return { success: true, results: this.roomMembers.filter((item) => item.roomId === values[0] && !item.left).map((item) => ({ member_id: item.memberId })) as T[] };
        if (sql.includes("SELECT member_id, member_role FROM chat_room_members"))
          return { success: true, results: this.roomMembers.filter((item) => item.roomId === values[0] && !item.left).map((item) => ({ member_id: item.memberId, member_role: item.role })) as T[] };
        if (sql.includes("FROM clubs c") && sql.includes("club_memberships cm"))
          return { success: true, results: this.clubs.filter((club) => club.leader_member_id === Number(values[0]) || this.approvedClubMemberIds.has(Number(values[1]))) as T[] };
        if (sql.includes("FROM chat_rooms cr WHERE cr.deleted_at IS NULL") && sql.includes("ORDER BY"))
          return { success: true, results: [...this.rooms.values()].filter((room) =>
            !["event", "dm", "group", "board"].includes(room.room_type) || !this.roomMembers.some((item) =>
              item.roomId === room.id && item.memberId === Number(values[0]) && item.left)) as T[] };
        if (sql.includes("creator.public_member_id AS creator_public_member_id"))
          return { success: true, results: [...this.rooms.values()].filter((room) => values.includes(room.id)).map((room) => ({
            id: room.id,
            creator_public_member_id: this.members.find((item) => item.id === room.created_by_member_id)?.public_member_id ?? null,
            cancelled_title: null, last_content: null, last_image_url: null, last_created_at: null,
            unread_count: 0, mention_count: 0,
          })) as T[] };
        if (sql.includes("FROM chat_room_members crm JOIN members")) {
          const result = this.roomMembers.filter((item) => values.includes(item.roomId) && !item.left).map((item) => {
            const member = this.members.find((entry) => entry.id === item.memberId)!;
            return { room_id: item.roomId, member_id: item.memberId, public_member_id: member.public_member_id, display_name: member.display_name };
          });
          return { success: true, results: result as T[] };
        }
        if (sql.includes("FROM chat_messages cm JOIN members"))
          return { success: true, results: this.messages as T[] };
        return { success: true, results: [] as T[] };
      },
      run: async () => {
        this.writes.push(sql);
        if (sql.includes("INSERT OR IGNORE INTO in_app_notifications") && sql.includes("VALUES (?, ?, 'chat'"))
          this.notifiedMemberIds.push(Number(values[1]));
        if (sql.includes("INSERT OR IGNORE INTO chat_rooms") && sql.includes("'club'")) {
          this.rooms.set(String(values[0]), { id: String(values[0]), name: String(values[1]), room_type: "club", source_id: String(values[2]), required_rank: null, created_by_member_id: null });
        }
        if (sql.includes("INSERT INTO chat_room_members") && sql.includes("SELECT ?, m.id")) {
          for (const memberId of new Set([...this.approvedClubMemberIds, Number(values[1])])) {
            if (!Number.isFinite(memberId)) continue;
            const existing = this.roomMembers.find((item) => item.roomId === values[0] && item.memberId === memberId);
            if (existing) existing.left = false;
            else this.roomMembers.push({ roomId: String(values[0]), memberId, role: memberId === values[1] ? "owner" : "member", left: false });
          }
        }
        if (sql.includes("UPDATE chat_room_members SET left_at") && sql.includes("NOT IN")) {
          for (const item of this.roomMembers) if (item.roomId === values[1] && !this.approvedClubMemberIds.has(item.memberId) && item.memberId !== values[2]) item.left = true;
        }
        if (sql.includes("INSERT OR IGNORE INTO chat_rooms") && values[0] === "community-free-chat") {
          this.rooms.set("community-free-chat", { id: "community-free-chat", name: "フリーチャット", room_type: "board", source_id: "community-free-chat", required_rank: null, created_by_member_id: null });
        } else if (sql.includes("INSERT INTO chat_rooms")) {
          this.rooms.set(String(values[0]), {
            id: String(values[0]), name: String(values[1]), room_type: String(values[2]), source_id: values[3] ? String(values[3]) : null,
            required_rank: null, created_by_member_id: Number(values[4]),
          });
        }
        if (sql.includes("INSERT INTO chat_room_members") && !sql.includes("SELECT ?, m.id")) {
          const roomId = String(values[0]);
          const memberId = Number(values[1]);
          const existing = this.roomMembers.find((item) => item.roomId === roomId && item.memberId === memberId);
          if (existing) existing.left = false;
          else this.roomMembers.push({ roomId, memberId, role: sql.includes("'owner'") ? "owner" : "member", left: false });
        }
        if (sql.includes("UPDATE chat_room_members SET left_at") && !sql.includes("NOT IN")) {
          const found = this.roomMembers.find((item) => item.roomId === values[1] && item.memberId === Number(values[2]));
          if (found) found.left = true;
        }
        if (sql.includes("INTO chat_messages") && !this.messages.some((message) => message.id === values[0])) {
          const systemMessage = sql.includes("chat_leave_") || String(values[0]).startsWith("chat_leave_");
          this.messages.push({
            id: String(values[0]), room_id: String(values[1]), sender_member_id: Number(values[2]),
            sender_public_member_id: "IRO0099", sender_display_name: "運営テスト",
            sender_profile_json: JSON.stringify({ avatarUrl: "https://cdn.example/operator.png" }),
            content: String(values[3]), image_url: systemMessage ? null : values[4] ? String(values[4]) : null,
            image_urls_json: systemMessage ? "[]" : String(values[5] ?? "[]"),
            reply_to_json: systemMessage ? null : values[6] ? String(values[6]) : null,
            created_at: String(values[systemMessage ? 4 : 7]), updated_at: String(values[systemMessage ? 5 : 8]),
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
    vi.mocked(canMemberAccessClub).mockImplementation(async (_database, clubId, memberId) => clubId === "club-travel" && (memberId === 10 || db.approvedClubMemberIds.has(memberId)));
  });

  it("stores and returns several images in one chat message", async () => {
    const imageUrls = ["/api/event-images/chats%2Fone.jpg", "/api/event-images/chats%2Ftwo.jpg"];
    const created = await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "", imageUrls }), env);
    expect(created?.status).toBe(201);
    const message = (await created?.json())?.message;
    expect(message.attachmentUrls).toEqual(imageUrls);
    expect(message.imageUri).toBeUndefined();
    expect(db.messages).toHaveLength(1);
    expect(db.messages[0].image_urls_json).toBe(JSON.stringify(imageUrls));
  });

  it("keeps the referenced message visible after a reply is saved and reloaded", async () => {
    const original = await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "元のメッセージ" }), env);
    const originalId = (await original?.json() as { message: { id: string } }).message.id;
    const response = await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "返信です", replyToId: originalId }), env);
    expect(response?.status).toBe(201);
    const reply = (await response?.json() as { message: { replyTo?: { id: string; authorName: string; excerpt: string } } }).message.replyTo;
    expect(reply).toEqual({ id: originalId, authorName: "運営テスト", excerpt: "元のメッセージ" });
    const listing = await handleChatContentRequest(request("/api/chats/community-free-chat/messages"), env);
    const messages = (await listing?.json() as { messages: Array<{ replyTo?: typeof reply }> }).messages;
    expect(messages.find((message) => message.replyTo?.id === originalId)?.replyTo).toEqual(reply);
    db.messages.push({ ...db.messages[0], id: "another-room-message", room_id: "branch-kanto-free" });
    const invalid = await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "返信", replyToId: "another-room-message" }), env);
    expect(invalid?.status).toBe(404);
  });

  it("rejects invalid image lists", async () => {
    const invalid = await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "", imageUrls: ["https://example.com/a.jpg", "javascript:bad"] }), env);
    expect(invalid?.status).toBe(400);
    expect(db.messages).toHaveLength(0);
  });

  it("notifies direct mentions and room-scoped group mentions in the global free chat", async () => {
    // Global free chat can be read without joining chat_room_members first.
    expect((await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "こんにちは" }), env))?.status).toBe(201);
    expect(db.notifiedMemberIds).toEqual([]);
    expect((await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "@everyone 集合です" }), env))?.status).toBe(201);
    expect(db.notifiedMemberIds).toEqual([10, 11]);
    db.notifiedMemberIds = [];
    expect((await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "@友達A こんにちは" }), env))?.status).toBe(201);
    expect(db.notifiedMemberIds).toEqual([10]);
    db.notifiedMemberIds = [];
    expect((await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "@関西支部 の皆さん" }), env))?.status).toBe(201);
    expect(db.notifiedMemberIds).toEqual([11]);
    db.notifiedMemberIds = [];
    expect((await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "@全体 @友達A 集合" }), env))?.status).toBe(201);
    expect(db.notifiedMemberIds.sort()).toEqual([10, 11]);
    db.notifiedMemberIds = [];
    expect((await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "@everyoneさん こんにちは" }), env))?.status).toBe(201);
    expect(db.notifiedMemberIds).toEqual([]);
  });

  it("keeps branch and club group mentions inside the room's access boundary", async () => {
    db.members.push({ id: 12, public_member_id: "IRO0012", display_name: "運営A", branches_json: "[]", role: "operator", access_role: "operator" });
    expect((await handleChatContentRequest(request("/api/chats/branch-kanto-free/messages", "POST", { content: "@支部全員 お知らせ" }), env))?.status).toBe(201);
    expect(db.notifiedMemberIds).toEqual([10]);
    db.notifiedMemberIds = [];
    expect((await handleChatContentRequest(request("/api/chats/branch-kanto-free/messages", "POST", { content: "@関西支部 お知らせ" }), env))?.status).toBe(201);
    expect(db.notifiedMemberIds).toEqual([]);
    db.notifiedMemberIds = [];
    expect((await handleChatContentRequest(request("/api/chats/club-chat-club-travel/messages", "POST", { content: "@チャット内の人全員 お知らせ" }), env))?.status).toBe(201);
    expect(db.notifiedMemberIds).toEqual([10]);
    db.notifiedMemberIds = [];
    expect((await handleChatContentRequest(request("/api/chats/branch-kanto-free/messages", "POST", { content: "@運営A 確認お願いします" }), env))?.status).toBe(201);
    expect(db.notifiedMemberIds).toEqual([12]);
  });

  it("creates a room for each joined club and limits ordinary members to their clubs", async () => {
    const listing = await handleChatContentRequest(request("/api/chats"), env);
    const body = await listing?.json() as { rooms: { id: string; name: string }[] };
    expect(body.rooms).toContainEqual(expect.objectContaining({ id: "club-chat-club-travel", name: "旅行部チャット" }));
    expect((await handleChatContentRequest(request("/api/chats/club-chat-club-travel/messages"), env))?.status).toBe(200);

    db.approvedClubMemberIds.delete(9);
    authenticatedRequestMember.mockResolvedValue({ id: 10, role: "user", access_role: "member", account_status: "active" });
    expect((await handleChatContentRequest(request("/api/chats/club-chat-club-travel/messages", "POST", { content: "部員向けのお知らせ" }), env))?.status).toBe(201);
    expect(db.roomMembers.find((item) => item.roomId === "club-chat-club-travel" && item.memberId === 9)?.left).toBe(true);
    authenticatedRequestMember.mockResolvedValue({ id: 9, role: "admin", access_role: "admin", account_status: "active" });
    expect((await handleChatContentRequest(request("/api/chats/club-chat-club-travel/messages"), env))?.status).toBe(200);
    expect((await handleChatContentRequest(request("/api/chats/club-chat-club-travel/messages", "POST", { content: "閲覧できない投稿" }), env))?.status).toBe(403);
    const hiddenListing = await handleChatContentRequest(request("/api/chats"), env);
    const hidden = await hiddenListing?.json() as { rooms: { id: string }[] };
    expect(hidden.rooms.some((room) => room.id === "club-chat-club-travel")).toBe(true);
    authenticatedRequestMember.mockResolvedValue({ id: 9, role: "operator", access_role: "operator", account_status: "active" });
    expect((await handleChatContentRequest(request("/api/chats/club-chat-club-travel/messages"), env))?.status).toBe(200);
    expect((await handleChatContentRequest(request("/api/chats/club-chat-club-travel/messages", "POST", { content: "運営の非参加投稿" }), env))?.status).toBe(403);
  });

  it("lets administrators and operators view non-member DMs without posting or managing them", async () => {
    db.rooms.set("dm-private", { id: "dm-private", name: "DM", room_type: "dm", source_id: "dm-private", required_rank: null, created_by_member_id: 10 });
    db.roomMembers.push(
      { roomId: "dm-private", memberId: 10, role: "owner", left: false },
      { roomId: "dm-private", memberId: 11, role: "member", left: false },
    );
    expect((await handleChatContentRequest(request("/api/chats/dm-private/messages"), env))?.status).toBe(403);
    for (const role of ["admin", "operator"] as const) {
      authenticatedRequestMember.mockResolvedValue({ id: 9, role, access_role: role, account_status: "active" });
      const list = await handleChatContentRequest(request("/api/chats"), env);
      const listed = await list?.json() as { rooms: { id: string; name: string }[] };
      expect(listed.rooms).toContainEqual(expect.objectContaining({ id: "dm-private", name: "友達A・友達B" }));
      expect((await handleChatContentRequest(request("/api/chats/dm-private"), env))?.status).toBe(200);
      expect((await handleChatContentRequest(request("/api/chats/dm-private/messages"), env))?.status).toBe(200);
      expect((await handleChatContentRequest(request("/api/chats/dm-private/messages", "POST", { content: "監視者の投稿" }), env))?.status).toBe(403);
      expect((await handleChatContentRequest(request("/api/chats/dm-private", "DELETE"), env))?.status).toBe(403);
    }
  });

  it("hides a departed chat from that member's list and restores it after a new invitation", async () => {
    db.rooms.set("dm-departed", { id: "dm-departed", name: "DM", room_type: "dm", source_id: "dm-departed", required_rank: null, created_by_member_id: 10 });
    db.roomMembers.push(
      { roomId: "dm-departed", memberId: 9, role: "member", left: false },
      { roomId: "dm-departed", memberId: 10, role: "owner", left: false },
    );
    expect((await handleChatContentRequest(request("/api/chats/dm-departed/members/IRO0009", "DELETE"), env))?.status).toBe(200);
    const departed = await handleChatContentRequest(request("/api/chats"), env);
    expect(((await departed?.json()) as { rooms: { id: string }[] }).rooms.some((room) => room.id === "dm-departed")).toBe(false);
    db.roomMembers.find((item) => item.roomId === "dm-departed" && item.memberId === 9)!.left = false;
    const invited = await handleChatContentRequest(request("/api/chats"), env);
    expect(((await invited?.json()) as { rooms: { id: string }[] }).rooms.some((room) => room.id === "dm-departed")).toBe(true);
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
    expect(body.message).toMatchObject({ content: "運営からのお知らせ", senderId: "IRO0099", senderAvatar: "https://cdn.example/operator.png", shared: true });
    expect(db.writes.some((sql) => sql.includes("INSERT INTO audit_logs"))).toBe(true);
  });

  it("lets members use the global free chat and deduplicates a retried send", async () => {
    const id = "cm_retry_1234567890123456";
    const first = await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "こんにちは", clientMessageId: id }), env);
    const second = await handleChatContentRequest(request("/api/chats/community-free-chat/messages", "POST", { content: "こんにちは", clientMessageId: id }), env);
    expect(first?.status).toBe(201);
    expect(second?.status).toBe(201);
    expect(db.messages.filter((message) => message.id === id)).toHaveLength(1);
  });

  it("allows the matching and higher ranks to read a rank room", async () => {
    db.memberRank = "regular";
    const denied = await handleChatContentRequest(request("/api/chats/rank-gold/messages"), env);
    expect(denied?.status).toBe(403);
    db.memberRank = "gold";
    const allowed = await handleChatContentRequest(request("/api/chats/rank-gold/messages"), env);
    expect(allowed?.status).toBe(200);
    db.memberRank = "platinum";
    const higherRank = await handleChatContentRequest(request("/api/chats/rank-gold/messages"), env);
    expect(higherRank?.status).toBe(200);
    const listing = await handleChatContentRequest(request("/api/chats"), env);
    const listed = await listing?.json() as { rooms: { id: string }[] };
    expect(listed.rooms.some((room) => room.id === "rank-gold")).toBe(true);
    db.memberRank = "silver";
    db.discordRolesJson = '["PLATINUM"]';
    expect((await handleChatContentRequest(request("/api/chats/rank-gold/messages"), env))?.status).toBe(200);
    db.memberRank = "regular";
    db.discordRolesJson = "[]";
    authenticatedRequestMember.mockResolvedValue({ id: 9, role: "operator", access_role: "operator", account_status: "active" });
    expect((await handleChatContentRequest(request("/api/chats/rank-gold/messages"), env))?.status).toBe(200);
  });

  it("creates a shared group, renames it, invites a member, and lets a member leave", async () => {
    const created = await handleChatContentRequest(request("/api/chats", "POST", {
      type: "group", name: "週末グルメ", memberIds: ["IRO0010", "IRO0011"],
    }), env);
    expect(created?.status).toBe(201);
    const createdBody = await created?.json() as { room: { id: string; participants: string[]; createdBy: string } };
    expect(createdBody.room.participants).toEqual(["IRO0009", "IRO0010", "IRO0011"]);
    expect(createdBody.room.createdBy).toBe("IRO0009");

    const posted = await handleChatContentRequest(request(`/api/chats/${createdBody.room.id}/messages`, "POST", { content: "週末に集まりましょう" }), env);
    expect(posted?.status).toBe(201);
    expect(db.writes.some((sql) => sql.includes("INSERT OR IGNORE INTO in_app_notifications") && sql.includes("chat_room_members"))).toBe(true);

    const renamed = await handleChatContentRequest(request(`/api/chats/${createdBody.room.id}`, "PATCH", { name: "新しい名前" }), env);
    expect(renamed?.status).toBe(200);
    const direct = await handleChatContentRequest(request(`/api/chats/${createdBody.room.id}`), env);
    expect((await direct?.json() as { room: { id: string } }).room.id).toBe(createdBody.room.id);

    authenticatedRequestMember.mockResolvedValue({ id: 10, role: "user", access_role: "member", account_status: "active" });
    const left = await handleChatContentRequest(request(`/api/chats/${createdBody.room.id}/members/IRO0010`, "DELETE"), env);
    expect(left?.status).toBe(200);
    expect(db.messages.some((message) => message.content === "【IRO+ システム】友達Aが退出しました")).toBe(true);
    expect((await handleChatContentRequest(request(`/api/chats/${createdBody.room.id}/members/IRO0010`, "DELETE"), env))?.status).toBe(409);
  });

  it("reuses one DM room for the same pair", async () => {
    const first = await handleChatContentRequest(request("/api/chats", "POST", { type: "dm", memberIds: ["IRO0010"] }), env);
    const firstBody = await first?.json() as { room: { id: string; name: string } };
    const second = await handleChatContentRequest(request("/api/chats", "POST", { type: "dm", memberIds: ["IRO0010"] }), env);
    const secondBody = await second?.json() as { room: { id: string } };
    expect(first?.status).toBe(201);
    expect(firstBody.room.name).toBe("友達A");
    expect(secondBody.room.id).toBe(firstBody.room.id);
  });
});
