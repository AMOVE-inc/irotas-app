import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticatedRequestMember, canMemberAccessClub } = vi.hoisted(() => ({
  authenticatedRequestMember: vi.fn(),
  canMemberAccessClub: vi.fn(),
}));

vi.mock("../sites/auth", () => ({ authenticatedRequestMember }));
vi.mock("../sites/clubs", () => ({ canMemberAccessClub }));

import { handleEventRequest } from "../sites/events";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

const eventRow = {
  id: "event-club-1",
  organizer_member_id: 20,
  public_member_id: "IRO0020",
  event_type: "club" as const,
  club_id: "club-bread",
  event_date: "2026-09-20",
  status: "open" as const,
  title: "パン部限定パン屋巡り",
  public_data_json: JSON.stringify({
    eventType: "club",
    clubId: "club-bread",
    title: "パン部限定パン屋巡り",
    description: "部員向けの詳細説明",
    date: "2026-09-20",
    time: "10:00",
    location: "東京都渋谷区の集合場所",
    image: "/api/event-images/events%2F20%2Fbread.jpg",
    capacity: 5,
    reservationCapacity: 6,
    attendees: 0,
    participants: [],
    applicantIds: [],
    companionIds: [],
    price: "2,000円",
    priceMin: 2000,
    priceMax: 2000,
    genres: [],
    category: "kanto",
    status: "open",
    applicationDeadline: "2026-09-15",
    selectionMethod: "first_come",
    googleMapsUrl: "https://maps.google.com/secret",
  }),
  private_memo: "幹事だけのメモ",
  created_at: "2026-08-22T00:00:00.000Z",
};

class EventAccessDatabase implements D1Database {
  row = { ...eventRow };
  participationStatus: string | null = null;
  notifications: Array<{ targetMemberId: number; type: string; eventId: string }> = [];

  prepare(sql: string): D1PreparedStatement {
    const db = this;
    let values: unknown[] = [];
    const statement: D1PreparedStatement = {
      bind: (...next: unknown[]) => { values = next; return statement; },
      first: async <T>() => {
        if (sql.includes("SELECT public_member_id FROM members")) return { public_member_id: "IRO0010" } as T;
        if (sql.includes("SELECT id FROM members WHERE public_member_id")) return { id: 10 } as T;
        if (sql.includes("FROM events e JOIN members")) return db.row as T;
        if (sql.includes("SELECT status FROM event_participations")) return db.participationStatus ? { status: db.participationStatus } as T : null;
        if (sql.includes("COUNT(*) AS count FROM event_participations")) return { count: db.participationStatus === "confirmed" ? 1 : 0 } as T;
        if (sql.includes("FROM event_favorites")) return null;
        return null;
      },
      all: async <T>() => {
        if (sql.includes("FROM events e JOIN members")) return { results: [db.row] as T[] };
        if (sql.includes("FROM event_participations p JOIN members")) {
          return { results: db.participationStatus ? [{ event_id: db.row.id, member_id: 10, public_member_id: "IRO0010", status: db.participationStatus }] as T[] : [] };
        }
        return { results: [] as T[] };
      },
      run: async () => {
        if (sql.includes("INSERT INTO event_participations")) db.participationStatus = String(values[2]);
        if (sql.includes("UPDATE event_participations SET status = 'confirmed'")) db.participationStatus = "confirmed";
        if (sql.includes("UPDATE events SET public_data_json")) db.row.public_data_json = String(values[0]);
        if (sql.includes("INSERT INTO in_app_notifications")) {
          db.notifications.push({ targetMemberId: Number(values[1]), type: "event_confirmed", eventId: String(values[4]) });
        }
        return { success: true };
      },
    };
    return statement;
  }

  async batch<T>(statements: D1PreparedStatement[]) {
    return statements.map(() => ({ success: true })) as T[];
  }
}

let db: EventAccessDatabase;
let env: SitesEnv;

describe("club event access", () => {
  beforeEach(() => {
    authenticatedRequestMember.mockResolvedValue({ id: 10, role: "user", access_role: "member" });
    canMemberAccessClub.mockReset();
    db = new EventAccessDatabase();
    env = { DB: db } as unknown as SitesEnv;
  });

  it("shows a redacted list preview but blocks detail and favorites for non-members", async () => {
    canMemberAccessClub.mockResolvedValue(false);

    const listResponse = await handleEventRequest(new Request("https://app.example/api/events"), env);
    const listBody = await listResponse?.json() as { events: Array<Record<string, unknown>> };
    expect(listResponse?.status).toBe(200);
    expect(listBody.events[0]).toMatchObject({ lockedClubEvent: true, location: "部員限定", participants: [] });
    expect(listBody.events[0]).not.toHaveProperty("googleMapsUrl");
    expect(listBody.events[0]).not.toHaveProperty("privateMemo");

    const detailResponse = await handleEventRequest(new Request("https://app.example/api/events/event-club-1"), env);
    expect(detailResponse?.status).toBe(403);

    const favoriteResponse = await handleEventRequest(new Request("https://app.example/api/events/event-club-1/favorite", {
      method: "PUT",
      body: JSON.stringify({ favorite: true }),
    }), env);
    expect(favoriteResponse?.status).toBe(403);
  });

  it("returns full detail to an approved member, assigned leader, or administrator", async () => {
    for (const session of [
      { id: 10, role: "user", access_role: "member" },
      { id: 20, role: "user", access_role: "club_leader" },
      { id: 40, role: "admin", access_role: "admin" },
    ]) {
      authenticatedRequestMember.mockResolvedValue(session);
      canMemberAccessClub.mockResolvedValue(true);
      const response = await handleEventRequest(new Request("https://app.example/api/events/event-club-1"), env);
      const body = await response?.json() as { event: Record<string, unknown> };
      expect(response?.status).toBe(200);
      expect(body.event).toMatchObject({ location: "東京都渋谷区の集合場所", googleMapsUrl: "https://maps.google.com/secret" });
      expect(body.event.lockedClubEvent).toBeUndefined();
    }
  });

  it("keeps club event details private from operators who are not club members", async () => {
    authenticatedRequestMember.mockResolvedValue({ id: 30, role: "operator", access_role: "operator" });
    canMemberAccessClub.mockResolvedValue(false);
    const response = await handleEventRequest(new Request("https://app.example/api/events/event-club-1"), env);
    expect(response?.status).toBe(403);
  });

  it("persists application, approval, event chat id, and confirmation notification", async () => {
    canMemberAccessClub.mockResolvedValue(true);
    authenticatedRequestMember.mockResolvedValue({ id: 10, role: "user", access_role: "member" });
    const applyResponse = await handleEventRequest(new Request("https://app.example/api/events/event-club-1/applications", {
      method: "POST",
      body: JSON.stringify({ termsAccepted: true }),
    }), env);
    const applyBody = await applyResponse?.json() as { event: Record<string, unknown> };
    expect(applyResponse?.status).toBe(201);
    expect(applyBody.event.viewerParticipationStatus).toBe("applied");

    authenticatedRequestMember.mockResolvedValue({ id: 30, role: "user", access_role: "member" });
    const unrelatedResponse = await handleEventRequest(new Request("https://app.example/api/events/event-club-1/participants/IRO0010", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    }), env);
    expect(unrelatedResponse?.status).toBe(403);

    authenticatedRequestMember.mockResolvedValue({ id: 20, role: "user", access_role: "club_leader" });
    const approveResponse = await handleEventRequest(new Request("https://app.example/api/events/event-club-1/participants/IRO0010", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    }), env);
    const approveBody = await approveResponse?.json() as { event: Record<string, unknown> };
    expect(approveResponse?.status).toBe(200);
    expect(approveBody.event).toMatchObject({ chatId: "event_chat_event-club-1", participants: ["IRO0010"] });
    expect(db.notifications).toContainEqual({ targetMemberId: 10, type: "event_confirmed", eventId: "event-club-1" });

    authenticatedRequestMember.mockResolvedValue({ id: 10, role: "user", access_role: "member" });
    const confirmedResponse = await handleEventRequest(new Request("https://app.example/api/events/event-club-1"), env);
    const confirmedBody = await confirmedResponse?.json() as { event: Record<string, unknown> };
    expect(confirmedBody.event).toMatchObject({ viewerParticipationStatus: "confirmed", chatId: "event_chat_event-club-1" });
  });
});
