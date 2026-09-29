import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelEventCheckout, eventCheckoutAmount, handleAdminEventPaymentsRequest, handleEventCheckoutRequest } from "../sites/event-checkout";
import { handleSquareWebhook, squareSignature } from "../sites/square-webhook";
import type { D1Database, D1PreparedStatement, D1Result, SitesEnv } from "../sites/platform-types";

const { authenticatedRequestMember } = vi.hoisted(() => ({ authenticatedRequestMember: vi.fn() }));
vi.mock("../sites/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sites/auth")>()), authenticatedRequestMember,
}));

function database() {
  const state = {
    participation: "confirmed",
    paymentState: null as string | null,
    eventStatus: "open",
    eventDate: "2099-10-01",
    paymentTiming: "prepaid",
    price: "5,000円",
    pointsUsed: 1_000,
    checkout: null as null | { id: string; event_id: string; member_id: number; item_name: string; amount_yen: number; points_used: number; status: string; square_order_id: string | null; square_payment_link_id?: string | null; checkout_url: string | null; square_payment_id?: string },
    webhookIds: new Set<string>(),
    processedWebhookIds: new Set<string>(),
    subscriptionWrites: 0,
    paymentMismatchAudits: 0,
    reviewAudits: 0,
    confirmationNotifications: 0,
    chatMemberships: 0,
  };
  const db: D1Database = {
    prepare(sql) {
      let params: unknown[] = [];
      const statement: D1PreparedStatement = {
        bind(...values) { params = values; return statement; },
        async first<T>() {
          if (sql.includes("FROM events WHERE id")) return { id: params[0], title: "公式イベント", event_type: "official", status: state.eventStatus, event_date: state.eventDate, public_data_json: JSON.stringify({ price: state.price, recruitmentChannel: "app", paymentTiming: state.paymentTiming }) } as T;
          if (sql.includes("FROM events e JOIN members")) return { id: params[0], title: "公式イベント", event_type: "official", status: state.eventStatus, event_date: state.eventDate, organizer_member_id: 20, public_data_json: JSON.stringify({ price: state.price, recruitmentChannel: "app", paymentTiming: state.paymentTiming }) } as T;
          if (sql.includes("FROM event_participations")) return { status: state.participation, payment_state: state.paymentState } as T;
          if (sql.includes("SELECT display_name FROM members")) return { display_name: "テスト会員" } as T;
          if (sql.includes("SELECT member_rank, discord_roles_json")) return { member_rank: "gold", discord_roles_json: "[]" } as T;
          if (sql.includes("FROM event_point_usages")) return { amount: state.pointsUsed } as T;
          if (sql.includes("FROM event_payment_checkouts WHERE event_id")) return state.checkout as T;
          if (sql.includes("FROM event_payment_checkouts WHERE square_order_id"))
            return (state.checkout?.square_order_id === params[0] ? state.checkout : null) as T;
          if (sql.includes("FROM event_payment_checkouts WHERE id")) return state.checkout as T;
          if (sql.includes("FROM square_webhook_events")) return (state.webhookIds.has(String(params[0])) ? { event_id: params[0], processed_at: state.processedWebhookIds.has(String(params[0])) ? "2026-09-13T00:00:00Z" : null } : null) as T;
          return null;
        },
        async run<T>() {
          if (sql.includes("UPDATE event_participations") && state.participation === "applied" && state.paymentState === "awaiting_payment") {
            state.participation = "confirmed";
            state.paymentState = "completed";
            return { success: true, meta: { changes: 1 } } as T;
          }
          if (sql.includes("SET payment_state = 'completed'") && ["confirmed", "cancel_requested"].includes(state.participation)) state.paymentState = "completed";
          if (sql.includes("INSERT OR IGNORE INTO event_payment_checkouts") && !state.checkout)
            state.checkout = { id: String(params[0]), event_id: String(params[1]), member_id: Number(params[2]), item_name: String(params[3]), amount_yen: Number(params[4]), points_used: Number(params[5]), status: "creating", square_order_id: null, checkout_url: null };
          if (sql.includes("UPDATE event_payment_checkouts SET status = 'ready'") && state.checkout) {
            state.checkout.status = "ready";
            state.checkout.square_payment_link_id = String(params[0]);
            state.checkout.square_order_id = String(params[1]);
            state.checkout.checkout_url = String(params[2]);
          }
          if (sql.includes("UPDATE event_payment_checkouts SET status = 'cancelled'") && state.checkout) state.checkout.status = "cancelled";
          if (sql.includes("UPDATE event_payment_checkouts SET status = 'paid'") && state.checkout) {
            state.checkout.status = "paid";
            state.checkout.square_payment_id = String(params[0]);
          }
          if (sql.includes("INSERT INTO square_webhook_events")) state.webhookIds.add(String(params[0]));
          if (sql.includes("UPDATE square_webhook_events SET processed_at")) state.processedWebhookIds.add(String(params[1]));
          if (sql.includes("UPDATE member_subscriptions")) state.subscriptionWrites++;
          if (sql.includes("'event.payment_mismatch'")) state.paymentMismatchAudits++;
          if (sql.includes("'event.payment_requires_review'")) state.reviewAudits++;
          if (String(params[0]).startsWith("event-payment-confirmed:")) state.confirmationNotifications++;
          if (sql.includes("INSERT INTO chat_room_members") && params[1] === 7) state.chatMemberships++;
          return { success: true } as T;
        },
        async all<T>() {
          return { success: true, results: [] as T[] };
        },
      };
      return statement;
    },
    async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      return Promise.all(statements.map((statement) => statement.run<T>()));
    },
  };
  return { db, state };
}

const path = "https://app.example/api/events/event-1/checkout";

describe("official event Square checkout foundation", () => {
  beforeEach(() => authenticatedRequestMember.mockResolvedValue({ id: 7, role: "user", access_role: "member", account_status: "active" }));
  afterEach(() => vi.restoreAllMocks());

  it("calculates yen amount from server price and reserved points, rejecting ambiguous prices", () => {
    expect(eventCheckoutAmount({ price: "5,000円", rankPrices: { gold: "4,000円" } }, "gold", 1_000)).toBe(3_000);
    expect(eventCheckoutAmount({ price: "無料" }, "regular", 0)).toBe(0);
    expect(eventCheckoutAmount({ price: "5,000〜8,000円" }, "regular", 0)).toBeNull();
    expect(eventCheckoutAmount({ price: "500円" }, "regular", 600)).toBeNull();
  });

  it("keeps the checkout endpoint disabled unless event payments are explicitly enabled", async () => {
    const { db } = database();
    const response = await handleEventCheckoutRequest(new Request(path, { method: "POST" }), { DB: db } as SitesEnv);
    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({ error: "公式イベントのアプリ内決済は現在停止しています" });
  });

  it("requires sign-in and a confirmed participant before contacting Square", async () => {
    const { db, state } = database();
    const env = { DB: db, SQUARE_ACCESS_TOKEN: "test-token", SQUARE_LOCATION_ID: "test-location", EVENT_PAYMENTS_ENABLED: "true" } as SitesEnv;
    const fetcher = vi.spyOn(globalThis, "fetch");
    authenticatedRequestMember.mockResolvedValueOnce(null);
    expect((await handleEventCheckoutRequest(new Request(path, { method: "POST" }), env))?.status).toBe(401);
    state.participation = "applied";
    expect((await handleEventCheckoutRequest(new Request(path, { method: "POST" }), env))?.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("restricts the shared payment list to administrators", async () => {
    const { db } = database();
    const env = { DB: db } as SitesEnv;
    const request = new Request("https://app.example/api/admin/event-payments");
    expect((await handleAdminEventPaymentsRequest(request, env))?.status).toBe(403);
    authenticatedRequestMember.mockResolvedValueOnce({ id: 1, role: "admin", access_role: "admin" });
    const response = await handleAdminEventPaymentsRequest(request, env);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ payments: [] });
  });

  it("skips Square for a zero-yen balance and reuses one checkout for retries", async () => {
    const { db, state } = database();
    const env = { DB: db, SQUARE_ACCESS_TOKEN: "test-token", SQUARE_LOCATION_ID: "test-location", EVENT_PAYMENTS_ENABLED: "true" } as SitesEnv;
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ payment_link: { id: "link-1", order_id: "order-1", url: "https://square.link/u/example" } }));
    state.pointsUsed = 5_000;
    expect(await (await handleEventCheckoutRequest(new Request(path, { method: "POST" }), env))?.json()).toMatchObject({ status: "free", amountYen: 0 });
    expect(fetcher).not.toHaveBeenCalled();
    state.pointsUsed = 1_000;
    const created = await handleEventCheckoutRequest(new Request(path, { method: "POST" }), env);
    expect(created?.status).toBe(200);
    expect(await created?.json()).toMatchObject({ status: "ready", amountYen: 4_000, checkoutUrl: "https://square.link/u/example" });
    const sent = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as { quick_pay: { price_money: { amount: number; currency: string } }; idempotency_key: string; checkout_options: { redirect_url: string; enable_coupon: boolean; enable_loyalty: boolean; allow_tipping: boolean } };
    expect(sent.quick_pay.price_money).toEqual({ amount: 4_000, currency: "JPY" });
    expect(sent.idempotency_key).toBe(state.checkout?.id);
    expect(sent.checkout_options).toMatchObject({ redirect_url: "https://app.irotas-community.com/event-detail?id=event-1", enable_coupon: false, enable_loyalty: false, allow_tipping: false });
    expect((await handleEventCheckoutRequest(new Request(path, { method: "POST" }), env))?.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("discovers an active Square location when the environment does not specify one", async () => {
    const { db } = database();
    const env = { DB: db, SQUARE_ACCESS_TOKEN: "different-test-token", EVENT_PAYMENTS_ENABLED: "true" } as SitesEnv;
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ locations: [{ id: "auto-location", status: "ACTIVE", capabilities: ["CREDIT_CARD_PROCESSING"] }] }))
      .mockResolvedValueOnce(Response.json({ payment_link: { id: "link-auto", order_id: "order-auto", url: "https://square.link/u/auto" } }));
    const response = await handleEventCheckoutRequest(new Request(path, { method: "POST" }), env);
    expect(response?.status).toBe(200);
    expect(fetcher.mock.calls[0][0]).toBe("https://connect.squareup.com/v2/locations");
    const sent = JSON.parse(String(fetcher.mock.calls[1][1]?.body)) as { quick_pay: { location_id: string } };
    expect(sent.quick_pay.location_id).toBe("auto-location");
  });

  it("offers post-payment only after an event ends and keeps the participant confirmed", async () => {
    const { db, state } = database();
    state.paymentTiming = "postpaid";
    state.pointsUsed = 0;
    const env = { DB: db, SQUARE_ACCESS_TOKEN: "test-token", SQUARE_LOCATION_ID: "test-location", EVENT_PAYMENTS_ENABLED: "true", SQUARE_WEBHOOK_SIGNATURE_KEY: "post-signature", SQUARE_WEBHOOK_NOTIFICATION_URL: "https://app.example/api/webhooks/square" } as SitesEnv;
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ payment_link: { id: "post-link", order_id: "post-order", url: "https://square.link/u/post" } }));

    const beforeEnd = await handleEventCheckoutRequest(new Request(path, { method: "POST" }), env);
    expect(beforeEnd?.status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();

    state.checkout = { id: "post-checkout", event_id: "event-1", member_id: 7, item_name: "公式イベント", amount_yen: 4_000, points_used: 0, status: "creating", square_order_id: null, checkout_url: null };
    state.eventStatus = "ended";
    const afterEnd = await handleEventCheckoutRequest(new Request(path, { method: "POST" }), env);
    expect(afterEnd?.status).toBe(200);
    expect(await afterEnd?.json()).toMatchObject({ status: "ready", amountYen: 4_000, checkoutUrl: "https://square.link/u/post" });
    expect(state.participation).toBe("confirmed");

    const webhookBody = JSON.stringify({ event_id: "postpaid-completed", type: "payment.updated", data: { object: { payment: { id: "post-payment", order_id: "post-order", status: "COMPLETED", amount_money: { amount: 4_000, currency: "JPY" } } } } });
    const webhookSignature = await squareSignature(webhookBody, env.SQUARE_WEBHOOK_SIGNATURE_KEY!, env.SQUARE_WEBHOOK_NOTIFICATION_URL!);
    const webhookResponse = await handleSquareWebhook(new Request(env.SQUARE_WEBHOOK_NOTIFICATION_URL!, { method: "POST", headers: { "x-square-hmacsha256-signature": webhookSignature }, body: webhookBody }), env);
    expect(webhookResponse?.status).toBe(200);
    expect(state.paymentState).toBe("completed");
    expect(state.confirmationNotifications).toBe(0);
    expect(state.reviewAudits).toBe(0);
  });

  it("keeps a completed payment visible after an event price edit", async () => {
    const { db, state } = database();
    state.checkout = { id: "checkout-1", event_id: "event-1", member_id: 7, item_name: "公式イベント", amount_yen: 4_000, points_used: 1_000, status: "paid", square_order_id: "order-1", checkout_url: "https://square.link/u/example" };
    state.price = "料金未定";
    const response = await handleEventCheckoutRequest(new Request(path), { DB: db, EVENT_PAYMENTS_ENABLED: "true" } as SitesEnv);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ status: "paid", amountYen: 4_000, pointsUsed: 1_000 });
  });

  it("deletes an unpaid Square link before releasing a pending application", async () => {
    const { db, state } = database();
    state.checkout = { id: "checkout-1", event_id: "event-1", member_id: 7, item_name: "公式イベント", amount_yen: 4_000, points_used: 1_000, status: "ready", square_payment_link_id: "link-1", square_order_id: "order-1", checkout_url: "https://square.link/u/example" };
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    expect(await cancelEventCheckout(db, { SQUARE_ACCESS_TOKEN: "test-token" } as SitesEnv, "event-1", 7)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith("https://connect.squareup.com/v2/online-checkout/payment-links/link-1", expect.objectContaining({ method: "DELETE" }));
    expect(state.checkout.status).toBe("cancelled");
  });

  it("confirms a pending paid applicant once and adds them to the event chat", async () => {
    const { db, state } = database();
    state.participation = "applied";
    state.paymentState = "awaiting_payment";
    state.checkout = { id: "checkout-1", event_id: "event-1", member_id: 7, item_name: "公式イベント", amount_yen: 4_000, points_used: 1_000, status: "ready", square_order_id: "order-1", checkout_url: "https://square.link/u/example" };
    const env = { DB: db, SQUARE_WEBHOOK_SIGNATURE_KEY: "signature-key", SQUARE_WEBHOOK_NOTIFICATION_URL: "https://app.example/api/webhooks/square", EVENT_PAYMENTS_ENABLED: "true" } as SitesEnv;
    expect(await (await handleEventCheckoutRequest(new Request(path), env))?.json()).toMatchObject({ status: "ready", amountYen: 4_000 });
    const body = JSON.stringify({ event_id: "paid-event", type: "payment.updated", data: { object: { payment: { id: "payment-1", order_id: "order-1", status: "COMPLETED", amount_money: { amount: 4_000, currency: "JPY" } } } } });
    const signature = await squareSignature(body, env.SQUARE_WEBHOOK_SIGNATURE_KEY!, env.SQUARE_WEBHOOK_NOTIFICATION_URL!);
    const request = () => new Request(env.SQUARE_WEBHOOK_NOTIFICATION_URL!, { method: "POST", headers: { "x-square-hmacsha256-signature": signature }, body });
    expect((await handleSquareWebhook(request(), env))?.status).toBe(200);
    expect(state.participation).toBe("confirmed");
    expect(state.paymentState).toBe("completed");
    expect(state.confirmationNotifications).toBe(1);
    expect(state.chatMemberships).toBe(1);
    expect((await handleSquareWebhook(request(), env))?.status).toBe(200);
    expect(state.confirmationNotifications).toBe(1);
  });

  it("records a late payment after cancellation for review without confirming participation", async () => {
    const { db, state } = database();
    state.participation = "cancelled";
    state.checkout = { id: "checkout-1", event_id: "event-1", member_id: 7, item_name: "公式イベント", amount_yen: 4_000, points_used: 1_000, status: "cancelled", square_order_id: "order-1", checkout_url: null };
    const env = { DB: db, SQUARE_WEBHOOK_SIGNATURE_KEY: "signature-key", SQUARE_WEBHOOK_NOTIFICATION_URL: "https://app.example/api/webhooks/square" } as SitesEnv;
    const body = JSON.stringify({ event_id: "late-payment", type: "payment.updated", data: { object: { payment: { id: "payment-late", order_id: "order-1", status: "COMPLETED", amount_money: { amount: 4_000, currency: "JPY" } } } } });
    const signature = await squareSignature(body, env.SQUARE_WEBHOOK_SIGNATURE_KEY!, env.SQUARE_WEBHOOK_NOTIFICATION_URL!);
    const response = await handleSquareWebhook(new Request(env.SQUARE_WEBHOOK_NOTIFICATION_URL!, { method: "POST", headers: { "x-square-hmacsha256-signature": signature }, body }), env);
    expect(response?.status).toBe(200);
    expect(state.checkout.status).toBe("paid");
    expect(state.participation).toBe("cancelled");
    expect(state.reviewAudits).toBe(1);
  });

  it("marks only matching completed event payments paid, without changing monthly membership", async () => {
    const { db, state } = database();
    state.checkout = { id: "checkout-1", event_id: "event-1", member_id: 7, item_name: "公式イベント", amount_yen: 4_000, points_used: 1_000, status: "ready", square_order_id: "order-1", checkout_url: "https://square.link/u/example" };
    const env = { DB: db, SQUARE_WEBHOOK_SIGNATURE_KEY: "signature-key", SQUARE_WEBHOOK_NOTIFICATION_URL: "https://app.example/api/webhooks/square" } as SitesEnv;
    const send = async (eventId: string, status: string, amount: number) => {
      const body = JSON.stringify({ event_id: eventId, type: "payment.updated", data: { object: { payment: { id: `payment-${eventId}`, order_id: "order-1", customer_id: "customer-1", status, amount_money: { amount, currency: "JPY" } } } } });
      const signature = await squareSignature(body, env.SQUARE_WEBHOOK_SIGNATURE_KEY!, env.SQUARE_WEBHOOK_NOTIFICATION_URL!);
      return handleSquareWebhook(new Request(env.SQUARE_WEBHOOK_NOTIFICATION_URL!, { method: "POST", headers: { "x-square-hmacsha256-signature": signature }, body }), env);
    };
    expect((await send("wrong-amount", "COMPLETED", 3_000))?.status).toBe(200);
    expect(state.checkout.status).toBe("ready");
    expect(state.paymentMismatchAudits).toBe(1);
    expect((await send("failed", "FAILED", 4_000))?.status).toBe(200);
    expect(state.subscriptionWrites).toBe(0);
    expect((await send("paid", "COMPLETED", 4_000))?.status).toBe(200);
    expect(state.checkout.status).toBe("paid");
    expect(state.checkout.square_payment_id).toBe("payment-paid");
  });
});
