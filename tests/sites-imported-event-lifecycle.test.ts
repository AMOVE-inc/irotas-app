import { describe, expect, it, vi } from "vitest";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

const { authenticatedRequestMember } = vi.hoisted(() => ({ authenticatedRequestMember: vi.fn() }));
vi.mock("../sites/auth", () => ({ authenticatedRequestMember }));

import { handleEventRequest } from "../sites/events";

function fakeDatabase(eventType: "gourmet" | "club" = "gourmet") {
  const id = "discord-event-1547552751800553543";
  let row: Record<string, unknown> | null = {
    id, organizer_member_id: 7, event_type: eventType, club_id: eventType === "club" ? "club-walk" : null,
    event_date: "2026-09-26", status: "open", title: "イベント",
    public_data_json: JSON.stringify({ title: "イベント", date: "2026-09-26", time: "19:30", capacity: 2, recruitmentChannel: "discord" }),
    created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z",
    organizer_display_name: "幹事", public_member_id: "IRO0007", organizer_member_rank: "gold",
  };
  const deleted = new Set<string>();
  const db: D1Database = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement: D1PreparedStatement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async first<T>() {
          if (sql.includes("FROM deleted_imported_events")) return (deleted.has(String(args[0])) ? { deleted: 1 } : null) as T | null;
          if (sql.includes("FROM events e JOIN members m")) return row as T | null;
          if (sql.includes("SELECT public_member_id FROM members")) return { public_member_id: `IRO000${args[0]}` } as T;
          return null;
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
        async run() {
          if (sql.includes("INSERT OR IGNORE INTO deleted_imported_events")) deleted.add(String(args[0]));
          if (sql.includes("DELETE FROM events")) row = null;
          if (sql.includes("UPDATE events SET status = 'full'")) row = { ...row, status: "full", public_data_json: args[0] };
          return { success: true };
        },
      };
      return statement;
    },
    async batch<T>(statements: D1PreparedStatement[]) { return Promise.all(statements.map((statement) => statement.run<T>())); },
  };
  return { id, db, deleted, readRow: () => row };
}

describe("Discord-imported event lifecycle", () => {
  it("keeps an admin-deleted event deleted on later detail requests", async () => {
    const state = fakeDatabase();
    authenticatedRequestMember.mockResolvedValue({ id: 1, role: "admin", access_role: "admin", account_status: "active" });
    const env = { DB: state.db } as SitesEnv;
    const url = `https://example.test/api/events/${state.id}`;
    expect((await handleEventRequest(new Request(url, { method: "DELETE" }), env))?.status).toBe(200);
    expect(state.deleted.has(state.id)).toBe(true);
    expect((await handleEventRequest(new Request(url), env))?.status).toBe(404);
  });

  it("lets the organizer close Discord recruitment and keeps that state", async () => {
    const state = fakeDatabase();
    authenticatedRequestMember.mockResolvedValue({ id: 7, role: "user", access_role: "member", account_status: "active" });
    const env = { DB: state.db } as SitesEnv;
    const url = `https://example.test/api/events/${state.id}`;
    const response = await handleEventRequest(new Request(url, { method: "PATCH", body: JSON.stringify({ action: "close_discord_recruitment" }) }), env);
    expect(response?.status).toBe(200);
    expect((await response!.json()).event.status).toBe("full");
    expect(JSON.parse(String(state.readRow()?.public_data_json)).discordRecruitmentClosedAt).toBeTruthy();
  });

  it("lets the club leader delete their imported club event", async () => {
    const state = fakeDatabase("club");
    authenticatedRequestMember.mockResolvedValue({ id: 7, role: "user", access_role: "member", account_status: "active" });
    const env = { DB: state.db } as SitesEnv;
    const response = await handleEventRequest(new Request(`https://example.test/api/events/${state.id}`, { method: "DELETE" }), env);
    expect(response?.status).toBe(200);
    expect(state.deleted.has(state.id)).toBe(true);
    // Imported events are hidden by a tombstone while their linked history remains intact.
    expect(state.readRow()).not.toBeNull();
  });

  it("does not let another member delete an imported club event", async () => {
    const state = fakeDatabase("club");
    authenticatedRequestMember.mockResolvedValue({ id: 8, role: "user", access_role: "member", account_status: "active" });
    const env = { DB: state.db } as SitesEnv;
    const response = await handleEventRequest(new Request(`https://example.test/api/events/${state.id}`, { method: "DELETE" }), env);
    expect(response?.status).toBe(403);
    expect(state.readRow()).not.toBeNull();
  });
});
