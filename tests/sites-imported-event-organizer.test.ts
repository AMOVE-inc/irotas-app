import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMPORTED_DISCORD_EVENTS } from "../constants/imported-discord-events";
import { handleEventRequest } from "../sites/events";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

const { authenticatedRequestMember } = vi.hoisted(() => ({ authenticatedRequestMember: vi.fn() }));
vi.mock("../sites/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sites/auth")>()), authenticatedRequestMember,
}));

const hosted = IMPORTED_DISCORD_EVENTS.find((event) => event.eventType !== "club" && /^discord-\d{17,20}$/.test(event.organizerProfileId))!;
const discordUserId = hosted.organizerProfileId.slice("discord-".length);

function database() {
  const updates: unknown[][] = [];
  const db: D1Database = {
    prepare(sql) {
      let values: unknown[] = [];
      const statement: D1PreparedStatement = {
        bind(...next) { values = next; return statement; },
        async first<T>() {
          if (sql.includes("SELECT public_member_id FROM members")) return { public_member_id: "IRO0017" } as T;
          if (sql.includes("SELECT discord_user_id FROM members")) return { discord_user_id: discordUserId } as T;
          return null;
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
        async run() { if (sql.includes("UPDATE events SET organizer_member_id")) updates.push(values); return { success: true }; },
      };
      return statement;
    },
    async batch() { return []; },
  };
  return { db, updates };
}

describe("imported Discord event organizer lists", () => {
  beforeEach(() => authenticatedRequestMember.mockReset());

  it.each(["member", "club_leader"] as const)("marks the verified Discord organizer for %s accounts", async (accessRole) => {
    authenticatedRequestMember.mockResolvedValue({ id: 17, role: "user", access_role: accessRole, account_status: "active" });
    const { db, updates } = database();
    const response = await handleEventRequest(new Request("https://app.example/api/events"), { DB: db } as SitesEnv);
    expect(response?.status).toBe(200);
    const payload = await response?.json() as { events: { id: string; isOrganizer?: boolean }[] };
    expect(payload.events.find((event) => event.id === hosted.id)?.isOrganizer).toBe(true);
    expect(payload.events.some((event) => event.id !== hosted.id && event.isOrganizer === false)).toBe(true);
    expect(updates.some((values) => values.includes(hosted.organizerProfileId))).toBe(true);
  });
});
