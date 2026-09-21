import type { D1Database, SitesEnv } from "./platform-types";
import { confirmPaidEventParticipation } from "./events";

const encoder = new TextEncoder();

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function squareSignature(
  rawBody: string,
  signatureKey: string,
  notificationUrl: string,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signatureKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(notificationUrl + rawBody),
      ),
    ),
  );
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function accessStatus(status: string) {
  if (status === "ACTIVE") return "active";
  if (status === "PENDING") return "pending";
  return "suspended";
}

export function preserveOverdueGrace(
  nextAccessStatus: string,
  currentAccessStatus: string | null,
  currentGraceUntil: string | null,
) {
  if (
    nextAccessStatus === "active" &&
    currentAccessStatus === "grace" &&
    currentGraceUntil
  ) {
    return { accessStatus: "grace", graceUntil: currentGraceUntil };
  }
  return { accessStatus: nextAccessStatus, graceUntil: null };
}

export type SquareBillingEvent =
  | { kind: "subscription"; subscription: Record<string, unknown> }
  | { kind: "overdue"; customerId: string }
  | { kind: "paid"; customerId: string };

export function squareBillingEvent(
  event: Record<string, any>,
): SquareBillingEvent | null {
  const eventType = String(event.type ?? "");
  const object = event.data?.object ?? {};
  if (eventType.startsWith("subscription.") && object.subscription)
    return { kind: "subscription", subscription: object.subscription };
  const invoiceCustomerId = String(
    object.invoice?.primary_recipient?.customer_id ?? "",
  );
  if (eventType === "invoice.scheduled_charge_failed" && invoiceCustomerId)
    return { kind: "overdue", customerId: invoiceCustomerId };
  if (eventType === "invoice.payment_made" && invoiceCustomerId)
    return { kind: "paid", customerId: invoiceCustomerId };
  const payment = object.payment as Record<string, unknown> | undefined;
  const paymentCustomerId = String(payment?.customer_id ?? "");
  if (
    eventType === "payment.updated" &&
    payment?.status === "FAILED" &&
    paymentCustomerId
  )
    return { kind: "overdue", customerId: paymentCustomerId };
  return null;
}

async function processEvent(db: D1Database, event: Record<string, any>) {
  const payment = event.data?.object?.payment as Record<string, any> | undefined;
  if ((event.type === "payment.created" || event.type === "payment.updated") && payment?.order_id) {
    const checkout = await db.prepare("SELECT id, event_id, member_id, amount_yen FROM event_payment_checkouts WHERE square_order_id = ? LIMIT 1")
      .bind(String(payment.order_id)).first<{ id: string; event_id: string; member_id: number; amount_yen: number }>();
    if (checkout) {
      const money = payment.amount_money as { amount?: number; currency?: string } | undefined;
      if (payment.status === "COMPLETED") {
        if (typeof payment.id === "string" && money?.currency === "JPY" && money.amount === checkout.amount_yen) {
          const paidAt = new Date().toISOString();
          await db.prepare(`UPDATE event_payment_checkouts SET status = 'paid', square_payment_id = ?,
            paid_at = COALESCE(paid_at, ?), updated_at = ?
            WHERE id = ? AND status IN ('ready','cancelled') AND amount_yen = ?`)
            .bind(payment.id, paidAt, paidAt, checkout.id, checkout.amount_yen).run();
          const recorded = await db.prepare("SELECT status, square_payment_id FROM event_payment_checkouts WHERE id = ?")
            .bind(checkout.id).first<{ status: string; square_payment_id: string | null }>();
          if (recorded?.status === "paid" && recorded.square_payment_id === payment.id) {
            const confirmed = await confirmPaidEventParticipation(db, checkout.event_id, checkout.member_id, paidAt);
            if (!confirmed) await db.prepare(`INSERT INTO audit_logs (action, entity_type, entity_id, metadata_json, created_at)
              VALUES ('event.payment_requires_review', 'event_payment_checkout', ?, ?, ?)`).bind(
                checkout.id, JSON.stringify({ reason: "participation_not_eligible_after_payment", eventId: checkout.event_id, memberId: checkout.member_id }), paidAt,
              ).run();
          }
        } else {
          await db.prepare(`INSERT INTO audit_logs (action, entity_type, entity_id, metadata_json, created_at)
            VALUES ('event.payment_mismatch', 'event_payment_checkout', ?, ?, ?)`).bind(
              checkout.id,
              JSON.stringify({ expectedYen: checkout.amount_yen, received: money?.amount ?? null, currency: money?.currency ?? null }),
              new Date().toISOString(),
            ).run();
        }
      }
      // イベントの決済失敗を月額会費の延滞と誤判定しない。
      return;
    }
  }
  const action = squareBillingEvent(event);
  if (!action) return;
  const now = new Date();
  if (action.kind === "subscription") {
    const subscription = action.subscription;
    const subscriptionId = String(subscription.id ?? "");
    const customerId = String(subscription.customer_id ?? "");
    const status = String(subscription.status ?? "UNKNOWN");
    if (!subscriptionId) return;
    const nextAccessStatus = accessStatus(status);
    await db
      .prepare(
        `UPDATE member_subscriptions
      SET square_customer_id = COALESCE(NULLIF(?, ''), square_customer_id), square_status = ?,
          access_status = CASE
            WHEN ? = 'active' AND access_status = 'grace' AND grace_until_date IS NOT NULL THEN 'grace'
            ELSE ?
          END,
          grace_until_date = CASE
            WHEN ? = 'active' AND access_status = 'grace' AND grace_until_date IS NOT NULL THEN grace_until_date
            ELSE NULL
          END,
          paid_until_date = ?, last_verified_at = ?, updated_at = ?
      WHERE square_subscription_id = ? OR (? != '' AND square_customer_id = ?)`,
      )
      .bind(
        customerId,
        status,
        nextAccessStatus,
        nextAccessStatus,
        nextAccessStatus,
        subscription.paid_until_date ??
          subscription.charged_through_date ??
          null,
        now.toISOString(),
        now.toISOString(),
        subscriptionId,
        customerId,
        customerId,
      )
      .run();
    return;
  }
  if (action.kind === "overdue") {
    // A failed charge can occur before the invoice due date. Record it for
    // follow-up, but let full invoice reconciliation decide access blocking.
    const timestamp = new Date().toISOString();
    await db.prepare(`UPDATE member_subscriptions SET billing_status = 'PAYMENT_FAILED',
      last_verified_at = ?, updated_at = ?
      WHERE square_customer_id = ? AND square_status = 'ACTIVE' AND COALESCE(billing_status, '') <> 'OVERDUE_BLOCKED'`)
      .bind(timestamp, timestamp, action.customerId).run();
  } else if (action.kind === "paid") {
    // One payment does not prove that all older invoices are current. The
    // scheduled full reconciliation is the source of access restoration.
  }
}

export async function handleSquareWebhook(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== "/api/webhooks/square") return null;
  if (request.method !== "POST")
    return json({ error: "method not allowed" }, 405);
  if (
    !env.DB ||
    !env.SQUARE_WEBHOOK_SIGNATURE_KEY ||
    !env.SQUARE_WEBHOOK_NOTIFICATION_URL
  )
    return json({ error: "webhook not configured" }, 503);
  const rawBody = await request.text();
  if (rawBody.length > 2_000_000)
    return json({ error: "payload too large" }, 413);
  const received = request.headers.get("x-square-hmacsha256-signature") ?? "";
  const expected = await squareSignature(
    rawBody,
    env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    env.SQUARE_WEBHOOK_NOTIFICATION_URL,
  );
  if (!safeEqual(received, expected))
    return json({ error: "invalid signature" }, 403);
  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const eventId = String(event.event_id ?? "");
  const eventType = String(event.type ?? "");
  if (!eventId || !eventType) return json({ error: "invalid event" }, 400);
  const existing = await env.DB.prepare(
    "SELECT event_id, processed_at FROM square_webhook_events WHERE event_id = ?",
  )
    .bind(eventId)
    .first<{ event_id: string; processed_at: string | null }>();
  if (existing?.processed_at) return json({ ok: true, duplicate: true });
  if (!existing) await env.DB.prepare(
    "INSERT INTO square_webhook_events (event_id, event_type) VALUES (?, ?)",
  )
    .bind(eventId, eventType)
    .run();
  try {
    await processEvent(env.DB, event);
    await env.DB.prepare(
      "UPDATE square_webhook_events SET processed_at = ? WHERE event_id = ?",
    )
      .bind(new Date().toISOString(), eventId)
      .run();
    return json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "processing failed";
    await env.DB.prepare(
      "UPDATE square_webhook_events SET processing_error = ? WHERE event_id = ?",
    )
      .bind(message, eventId)
      .run();
    return json({ error: "processing failed" }, 500);
  }
}
