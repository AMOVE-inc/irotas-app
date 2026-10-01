import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleEventRequest } from "../sites/events";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

const { authenticatedRequestMember, canMemberAccessClub } = vi.hoisted(() => ({
  authenticatedRequestMember: vi.fn(),
  canMemberAccessClub: vi.fn(),
}));

vi.mock("../sites/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sites/auth")>()), authenticatedRequestMember,
}));
vi.mock("../sites/clubs", () => ({ canMemberAccessClub }));

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
  row = { ...eventRow } as Omit<typeof eventRow, "event_type" | "club_id" | "status"> & {
    event_type: "official" | "club";
    club_id: string | null;
    status: "open" | "full" | "ended" | "cancelled";
  };
  participationStatus: string | null = null;
  paymentState: string | null = null;
  cancellationPending = false;
  mutationQueries: string[] = [];
  notifications: { targetMemberId: number; type: string; eventId: string }[] = [];
  comments = new Map<string, { id: string; event_id: string; author_member_id: number; author_name: string; author_public_id: string; content: string; created_at: string; deleted_at: null }>();

  prepare(sql: string): D1PreparedStatement {
    const db = this;
    let values: unknown[] = [];
    const statement: D1PreparedStatement = {
      bind: (...next: unknown[]) => { values = next; return statement; },
      first: async <T>() => {
        if (sql.includes("SELECT public_member_id FROM members")) return { public_member_id: "IRO0010" } as T;
        if (sql.includes("SELECT display_name, discord_user_id FROM members")) return { display_name: "主催者", discord_user_id: null } as T;
        if (sql.includes("SELECT display_name FROM members WHERE id = ?")) return { display_name: "主催者" } as T;
        if (sql.includes("SELECT id FROM members WHERE public_member_id")) return { id: 10 } as T;
        if (sql.includes("FROM events e JOIN members")) return db.row as T;
        if (sql.includes("FROM event_participations WHERE event_id = ? AND member_id = ?")) return db.participationStatus ? { status: db.participationStatus, payment_state: db.paymentState } as T : null;
        if (sql.includes("FROM event_cancellation_requests") && sql.includes("status = 'pending'")) return db.cancellationPending ? { id: "cancel-1" } as T : null;
        if (sql.includes("COUNT(*) AS count FROM event_participations")) return { count: db.participationStatus === "confirmed" ? 1 : 0 } as T;
        if (sql.includes("FROM event_favorites")) return null;
        if (sql.includes("FROM event_comments") && sql.includes("WHERE id = ?")) return (db.comments.get(String(values[0])) ?? null) as T | null;
        return null;
      },
      all: async <T>() => {
        if (sql.includes("SELECT id, display_name, public_member_id") && sql.includes("FROM members")) return { results: [{ id: 21, display_name: "杏奈【GOLD会員】", public_member_id: "IRO0021", branches_json: "[]" }] as T[] };
        if (sql.includes("FROM events e JOIN members")) return { results: [db.row] as T[] };
        if (sql.includes("FROM event_participations p JOIN members")) {
          return { results: db.participationStatus ? [{ event_id: db.row.id, member_id: 10, public_member_id: "IRO0010", status: db.participationStatus, payment_state: db.paymentState }] as T[] : [] };
        }
        return { results: [] as T[] };
      },
      run: async () => {
        db.mutationQueries.push(sql);
        if (sql.includes("INSERT INTO event_participations")) { db.participationStatus = String(values[2]); db.paymentState = values[3] ? String(values[3]) : null; }
        if (sql.includes("UPDATE event_participations SET status = 'confirmed'")) db.participationStatus = "confirmed";
        if (sql.includes("UPDATE event_participations SET status = 'applied', payment_state = 'awaiting_payment'")) { db.participationStatus = "applied"; db.paymentState = "awaiting_payment"; }
        if (sql.includes("UPDATE events SET public_data_json")) db.row.public_data_json = String(values[0]);
        if (sql.includes("UPDATE events SET status = 'full', public_data_json")) db.row = { ...db.row, status: "full", public_data_json: String(values[0]) };
        if (sql.includes("UPDATE events SET status = 'open', public_data_json")) db.row = { ...db.row, status: "open", public_data_json: String(values[0]) };
        if (sql.includes("UPDATE events SET title = ?")) db.row = {
          ...db.row, title: String(values[0]), event_type: values[1] as "official" | "club",
          club_id: values[2] as string | null, event_date: String(values[3]),
          status: values[4] as typeof db.row.status, public_data_json: String(values[5]),
        };
        if (sql.includes("INSERT INTO event_cancellation_requests")) db.cancellationPending = true;
        if (sql.includes("UPDATE event_cancellation_requests SET status")) db.cancellationPending = false;
        if (sql.includes("UPDATE event_participations SET status = ?")) db.participationStatus = String(values[0]);
        if (sql.includes("UPDATE event_participations SET status = 'cancel_requested'")) db.participationStatus = "cancel_requested";
        if (sql.includes("UPDATE event_participations SET status = 'cancelled'")) db.participationStatus = "cancelled";
        if (sql.includes("INSERT OR IGNORE INTO event_comments")) db.comments.set(String(values[0]), {
          id: String(values[0]), event_id: String(values[1]), author_member_id: Number(values[2]), author_name: String(values[3]),
          author_public_id: String(values[4]), content: String(values[5]), created_at: String(values[6]), deleted_at: null,
        });
        if (sql.includes("INTO in_app_notifications")) {
          const type = sql.includes("'event_mention'") ? "event_mention" : sql.includes("'event_cancellation'") ? "event_cancellation" : sql.includes("'event_payment_ready'") ? "event_payment_ready" : "event_confirmed";
          db.notifications.push({ targetMemberId: Number(values[1]), type, eventId: String(values[4]) });
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

let db: EventAccessDatabase;
let env: SitesEnv;

describe("club event access", () => {
  beforeEach(() => {
    authenticatedRequestMember.mockResolvedValue({ id: 10, role: "user", access_role: "member" });
    canMemberAccessClub.mockReset();
    db = new EventAccessDatabase();
    const futureDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const futureDeadline = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    db.row.event_date = futureDate;
    db.row.public_data_json = JSON.stringify({ ...JSON.parse(db.row.public_data_json), date: futureDate, applicationDeadline: futureDeadline });
    env = { DB: db } as unknown as SitesEnv;
  });

  it("saves edits to an official event without a club ID", async () => {
    db.row = { ...db.row, id: "discord-event-1547552751800553543", event_type: "official", club_id: null };
    authenticatedRequestMember.mockResolvedValue({ id: 10, role: "admin", access_role: "admin" });
    const response = await handleEventRequest(new Request(`https://app.example/api/events/${db.row.id}`, {
      method: "PATCH", body: JSON.stringify({ action: "edit", title: "支部交流会 更新後", description: "変更した内容", participants: [] }),
    }), env);
    expect(response?.status).toBe(200);
    expect(db.row.title).toBe("支部交流会 更新後");
    expect(JSON.parse(db.row.public_data_json).description).toBe("変更した内容");
  });

  it("creates an in-app notification for a newly added event description mention", async () => {
    db.row = { ...db.row, organizer_member_id: 10, event_type: "official", club_id: null };
    authenticatedRequestMember.mockResolvedValue({ id: 10, role: "admin", access_role: "admin" });
    const response = await handleEventRequest(new Request(`https://app.example/api/events/${db.row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "edit", title: db.row.title, description: "@杏奈 ご確認ください", publicNotes: "@杏奈 ご確認ください", participants: [] }),
    }), env);
    expect(response?.status).toBe(200);
    expect(db.notifications).toContainEqual({ targetMemberId: 21, type: "event_mention", eventId: db.row.id });
  });

  it("creates an in-app notification when an event comment mentions a member", async () => {
    db.row = { ...db.row, event_type: "official", club_id: null };
    const response = await handleEventRequest(new Request(`https://app.example/api/events/${db.row.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ text: "@杏奈 ご確認ください" }),
    }), env);
    expect(response?.status).toBe(201);
    expect(db.notifications).toContainEqual({ targetMemberId: 21, type: "event_mention", eventId: db.row.id });
  });

  it("does not delete newly created events with テスト in their title when listing", async () => {
    db.row = { ...db.row, id: "event-new-1", title: "テスト食事会", event_type: "official", club_id: null };
    const response = await handleEventRequest(new Request("https://app.example/api/events"), env);
    expect((await response!.json()).events[0].title).toBe("テスト食事会");
    expect(db.mutationQueries.some((sql) => sql.includes("DELETE FROM events"))).toBe(false);
  });

  it("lets a regular event creator reopen recruitment after finalization", async () => {
    const original = JSON.parse(db.row.public_data_json);
    db.row = { ...db.row, id: "event-new-2", organizer_member_id: 10, event_type: "official", club_id: null, event_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), status: "full", public_data_json: JSON.stringify({ ...original, recruitmentChannel: "app", participantsFinalizedAt: "2026-09-12T00:00:00.000Z", manualRecruitmentClosedAt: "2026-09-12T00:00:00.000Z" }) };
    const response = await handleEventRequest(new Request("https://app.example/api/events/event-new-2", {
      method: "PATCH", body: JSON.stringify({ action: "reopen_recruitment" }),
    }), env);
    expect(response?.status).toBe(200);
    expect(db.row.status).toBe("open");
    expect(JSON.parse(db.row.public_data_json).participantsFinalizedAt).toBeUndefined();
    expect(JSON.parse(db.row.public_data_json).manualRecruitmentClosedAt).toBeUndefined();
  });

  it.each([
    ["幹事", { id: 20, role: "user", access_role: "member" }],
    ["運営", { id: 30, role: "operator", access_role: "operator" }],
    ["管理者", { id: 40, role: "admin", access_role: "admin" }],
  ])("lets %s close recruitment before capacity is reached", async (_label, session) => {
    db.row = { ...db.row, organizer_member_id: 20, event_type: "official", club_id: null, status: "open" };
    authenticatedRequestMember.mockResolvedValue(session);
    const response = await handleEventRequest(new Request(`https://app.example/api/events/${db.row.id}`, {
      method: "PATCH", body: JSON.stringify({ action: "close_recruitment" }),
    }), env);
    expect(response?.status).toBe(200);
    expect(db.row.status).toBe("full");
    expect(JSON.parse(db.row.public_data_json).manualRecruitmentClosedAt).toBeTruthy();
  });

  it("does not let another member close recruitment", async () => {
    db.row = { ...db.row, organizer_member_id: 20, event_type: "official", club_id: null, status: "open" };
    authenticatedRequestMember.mockResolvedValue({ id: 21, role: "user", access_role: "member" });
    const response = await handleEventRequest(new Request(`https://app.example/api/events/${db.row.id}`, {
      method: "PATCH", body: JSON.stringify({ action: "close_recruitment" }),
    }), env);
    expect(response?.status).toBe(403);
    expect(db.row.status).toBe("open");
  });

  it("shows a redacted list preview but blocks detail and favorites for non-members", async () => {
    canMemberAccessClub.mockResolvedValue(false);

    const listResponse = await handleEventRequest(new Request("https://app.example/api/events"), env);
    const listBody = await listResponse?.json() as { events: Record<string, unknown>[] };
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

  it("confirms a first-come official application without payment", async () => {
    const currentData = JSON.parse(db.row.public_data_json);
    db.row.event_type = "official";
    db.row.club_id = null;
    db.row.public_data_json = JSON.stringify({
      ...currentData,
      eventType: "official",
      clubId: undefined,
      selectionMethod: "first_come",
    });
    canMemberAccessClub.mockResolvedValue(false);

    const response = await handleEventRequest(new Request("https://app.example/api/events/event-club-1/applications", {
      method: "POST",
      body: JSON.stringify({ termsAccepted: true }),
    }), env);
    const body = await response?.json() as { event: Record<string, unknown> };

    expect(response?.status).toBe(201);
    expect(body.event).toMatchObject({
      viewerParticipationStatus: "confirmed",
      viewerPaymentState: null,
    });
    expect(db.notifications.some((notification) => notification.type === "event_confirmed")).toBe(true);
  });

  it("confirms a selected official lottery applicant without payment", async () => {
    const currentData = JSON.parse(db.row.public_data_json);
    db.row.event_type = "official";
    db.row.club_id = null;
    db.row.public_data_json = JSON.stringify({ ...currentData, eventType: "official", selectionMethod: "lottery" });
    const applied = await handleEventRequest(new Request("https://app.example/api/events/event-club-1/applications", {
      method: "POST", body: JSON.stringify({ termsAccepted: true }),
    }), env);
    expect((await applied?.json()).event.viewerPaymentState).toBeNull();
    authenticatedRequestMember.mockResolvedValue({ id: 20, role: "operator", access_role: "operator" });
    const selected = await handleEventRequest(new Request("https://app.example/api/events/event-club-1/participants/IRO0010", {
      method: "PATCH", body: JSON.stringify({ action: "approve" }),
    }), env);
    expect(selected?.status).toBe(200);
    expect(db.participationStatus).toBe("confirmed");
    expect(db.paymentState).toBeNull();
    expect(db.notifications.some((notification) => notification.type === "event_payment_ready")).toBe(false);
    expect(db.notifications.some((notification) => notification.type === "event_confirmed")).toBe(true);
  });

  it("notifies the organizer once for a cancellation request and the member after review", async () => {
    canMemberAccessClub.mockResolvedValue(true);
    db.participationStatus = "confirmed";
    authenticatedRequestMember.mockResolvedValue({ id: 10, role: "user", access_role: "member" });

    const request = () => handleEventRequest(new Request("https://app.example/api/events/event-club-1/cancellation-requests", {
      method: "POST",
      body: JSON.stringify({ contactedOrganizer: true, policyConfirmed: true }),
    }), env);
    expect((await request())?.status).toBe(201);
    expect(db.participationStatus).toBe("cancel_requested");
    expect(db.notifications).toContainEqual({ targetMemberId: 20, type: "event_cancellation", eventId: "event-club-1" });
    expect((await request())?.status).toBe(409);
    expect(db.notifications.filter((item) => item.targetMemberId === 20 && item.type === "event_cancellation")).toHaveLength(1);

    authenticatedRequestMember.mockResolvedValue({ id: 20, role: "user", access_role: "club_leader" });
    const reviewResponse = await handleEventRequest(new Request("https://app.example/api/events/event-club-1/cancellation-requests/IRO0010", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    }), env);
    expect(reviewResponse?.status).toBe(200);
    expect(db.participationStatus).toBe("cancelled");
    expect(db.notifications).toContainEqual({ targetMemberId: 10, type: "event_cancellation", eventId: "event-club-1" });
  });

  it("lets an applicant withdraw before confirmation without notifying the organizer", async () => {
    canMemberAccessClub.mockResolvedValue(true);
    db.participationStatus = "applied";
    authenticatedRequestMember.mockResolvedValue({ id: 10, role: "user", access_role: "member" });

    const response = await handleEventRequest(new Request("https://app.example/api/events/event-club-1/cancellation-requests", {
      method: "POST",
      body: JSON.stringify({}),
    }), env);

    expect(response?.status).toBe(201);
    expect(db.participationStatus).toBe("cancelled");
    expect(db.notifications).toHaveLength(0);
  });
});
