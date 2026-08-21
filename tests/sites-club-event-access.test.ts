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
  prepare(sql: string): D1PreparedStatement {
    const statement: D1PreparedStatement = {
      bind: () => statement,
      first: async <T>() => {
        if (sql.includes("SELECT public_member_id FROM members")) return { public_member_id: "IRO0010" } as T;
        if (sql.includes("FROM events e JOIN members")) return eventRow as T;
        if (sql.includes("FROM event_favorites")) return null;
        return null;
      },
      all: async <T>() => {
        if (sql.includes("FROM events e JOIN members")) return { results: [eventRow] as T[] };
        return { results: [] as T[] };
      },
      run: async () => ({ success: true }),
    };
    return statement;
  }

  async batch<T>(statements: D1PreparedStatement[]) {
    return statements.map(() => ({ success: true })) as T[];
  }
}

const db = new EventAccessDatabase();
const env = { DB: db } as SitesEnv;

describe("club event access", () => {
  beforeEach(() => {
    authenticatedRequestMember.mockResolvedValue({ id: 10, role: "user", access_role: "member" });
    canMemberAccessClub.mockReset();
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

  it("returns full detail to an approved member, assigned leader, or elevated operator", async () => {
    for (const session of [
      { id: 10, role: "user", access_role: "member" },
      { id: 20, role: "user", access_role: "club_leader" },
      { id: 30, role: "operator", access_role: "operator" },
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
});
