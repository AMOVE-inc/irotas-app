import type { D1Database, SitesEnv } from "./platform-types";

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

function addGraceDays(value: Date, days = 7) {
  return new Date(value.getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function accessStatus(status: string) {
  if (status === "ACTIVE") return "active";
  if (status === "PENDING") return "pending";
  return "suspended";
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
  const action = squareBillingEvent(event);
  if (!action) return;
  const now = new Date();
  if (action.kind === "subscription") {
    const subscription = action.subscription;
    const subscriptionId = String(subscription.id ?? "");
    const customerId = String(subscription.customer_id ?? "");
    const status = String(subscription.status ?? "UNKNOWN");
    if (!subscriptionId) return;
    await db
      .prepare(
        `UPDATE member_subscriptions
      SET square_customer_id = COALESCE(NULLIF(?, ''), square_customer_id), square_status = ?, access_status = ?,
          paid_until_date = ?, last_verified_at = ?, updated_at = ?
      WHERE square_subscription_id = ? OR (? != '' AND square_customer_id = ?)`,
      )
      .bind(
        customerId,
        status,
        accessStatus(status),
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
    await db
      .prepare(
        `UPDATE member_subscriptions
      SET billing_status = 'OVERDUE', access_status = 'grace', overdue_since = ?, grace_until_date = ?, updated_at = ?
      WHERE square_customer_id = ? AND square_status = 'ACTIVE'`,
      )
      .bind(
        now.toISOString(),
        addGraceDays(now),
        now.toISOString(),
        action.customerId,
      )
      .run();
  } else if (action.kind === "paid") {
    await db
      .prepare(
        `UPDATE member_subscriptions
      SET billing_status = 'PAID', access_status = CASE WHEN square_status = 'ACTIVE' THEN 'active' ELSE access_status END,
          overdue_since = NULL, grace_until_date = NULL, last_verified_at = ?, updated_at = ?
      WHERE square_customer_id = ?`,
      )
      .bind(now.toISOString(), now.toISOString(), action.customerId)
      .run();
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
    "SELECT event_id FROM square_webhook_events WHERE event_id = ?",
  )
    .bind(eventId)
    .first();
  if (existing) return json({ ok: true, duplicate: true });
  await env.DB.prepare(
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
