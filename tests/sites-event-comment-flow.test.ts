import { describe, expect, it, vi } from "vitest";
import { IMPORTED_DISCORD_EVENTS } from "../constants/imported-discord-events";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

const { authenticatedRequestMember } = vi.hoisted(() => ({ authenticatedRequestMember: vi.fn() }));
vi.mock("../sites/auth", () => ({ authenticatedRequestMember }));

import { handleEventRequest } from "../sites/events";

describe("shared imported event comments", () => {
  it("hides a deleted Discord comment from another member's subsequent read", async () => {
    const imported = IMPORTED_DISCORD_EVENTS.find((event) => event.importedComments.length > 0)!;
    const target = imported.importedComments[0];
    const rows = new Map<string, Record<string, unknown>>();
    const eventRow = {
      id: imported.id, event_type: imported.eventType, club_id: imported.clubId ?? null,
      public_data_json: JSON.stringify(imported), status: imported.status,
    };
    const db: D1Database = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const statement: D1PreparedStatement = {
          bind(...values: unknown[]) { args = values; return statement; },
          async first<T>() {
            if (sql.includes("FROM events e JOIN members m")) return eventRow as T;
            if (sql.includes("SELECT public_member_id FROM members")) return { public_member_id: `IRO000${args[0]}` } as T;
            if (sql.includes("SELECT display_name, discord_user_id FROM members")) return {
              display_name: "会員", discord_user_id: args[0] === 1 ? target.authorId?.replace(/^discord-/, "") : null,
            } as T;
            if (sql.includes("FROM event_comments WHERE id = ? AND event_id = ?")) return (rows.get(String(args[0])) ?? null) as T | null;
            return null;
          },
          async all<T>() {
            return { success: true, results: sql.includes("FROM event_comments") ? [...rows.values()] as T[] : [] };
          },
          async run() {
            if (sql.includes("INSERT INTO event_comments")) rows.set(String(args[0]), {
              id: args[0], event_id: args[1], author_member_id: null, author_name: args[2],
              author_public_id: args[3], content: args[4], created_at: args[5], deleted_at: args[7],
            });
            return { success: true };
          },
        };
        return statement;
      },
      async batch() { return []; },
    };
    const env = { DB: db } as SitesEnv;
    const commentsUrl = `https://example.test/api/events/${imported.id}/comments`;
    authenticatedRequestMember.mockResolvedValue({ id: 2, role: "user", access_role: "member", account_status: "active" });
    const before = await handleEventRequest(new Request(commentsUrl), env);
    expect((await before!.json()).comments.some((comment: { id: string }) => comment.id === target.id)).toBe(true);

    authenticatedRequestMember.mockResolvedValue({ id: 1, role: "user", access_role: "member", account_status: "active" });
    const deleted = await handleEventRequest(new Request(`${commentsUrl}/${target.id}`, { method: "DELETE" }), env);
    expect(deleted?.status).toBe(200);

    authenticatedRequestMember.mockResolvedValue({ id: 2, role: "user", access_role: "member", account_status: "active" });
    const after = await handleEventRequest(new Request(commentsUrl), env);
    expect((await after!.json()).comments.some((comment: { id: string }) => comment.id === target.id)).toBe(false);
  });
});
