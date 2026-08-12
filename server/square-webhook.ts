import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { claimSquareWebhookEvent, markMembershipInvoiceOverdue, markMembershipInvoicePaid, releaseSquareWebhookEvent, syncSquareSubscription } from "./db";
import type { SquareSubscriptionStatus } from "../lib/membership-access";

const subscriptionStatus = z.enum(["PENDING", "ACTIVE", "CANCELED", "DEACTIVATED", "PAUSED", "COMPLETED"]);
const basePayloadSchema = z.object({
  event_id: z.string().min(1),
  type: z.string().min(1),
  created_at: z.string().optional(),
});
const subscriptionPayloadSchema = basePayloadSchema.extend({
  data: z.object({
    object: z.object({
      subscription: z.object({
        id: z.string().min(1),
        customer_id: z.string().optional(),
        status: subscriptionStatus,
        paid_until_date: z.string().optional(),
        charged_through_date: z.string().optional(),
      }),
    }),
  }),
});
const invoicePayloadSchema = basePayloadSchema.extend({
  data: z.object({
    object: z.object({
      invoice: z.object({
        primary_recipient: z.object({ customer_id: z.string().min(1) }),
      }),
    }),
  }),
});

export type ParsedSquareWebhook =
  | { kind: "subscription"; eventId: string; eventType: string; subscription: z.infer<typeof subscriptionPayloadSchema>["data"]["object"]["subscription"] }
  | { kind: "invoice_overdue" | "invoice_paid"; eventId: string; eventType: string; customerId: string; createdAt: Date };

export function parseSquareWebhookPayload(json: unknown): ParsedSquareWebhook | null {
  const subscription = subscriptionPayloadSchema.safeParse(json);
  if (subscription.success && subscription.data.type.startsWith("subscription.")) {
    return { kind: "subscription", eventId: subscription.data.event_id, eventType: subscription.data.type, subscription: subscription.data.data.object.subscription };
  }
  const invoice = invoicePayloadSchema.safeParse(json);
  if (!invoice.success) return null;
  const eventType = invoice.data.type;
  const kind = eventType === "invoice.scheduled_charge_failed" ? "invoice_overdue" : eventType === "invoice.payment_made" ? "invoice_paid" : null;
  if (!kind) return null;
  const parsedDate = new Date(invoice.data.created_at ?? Date.now());
  return { kind, eventId: invoice.data.event_id, eventType, customerId: invoice.data.data.object.invoice.primary_recipient.customer_id, createdAt: Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate };
}

export function verifySquareSignature(rawBody: string, signature: string, signatureKey: string, notificationUrl: string): boolean {
  const expected = createHmac("sha256", signatureKey).update(notificationUrl + rawBody).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function handleSquareWebhook(req: Request, res: Response) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;
  const signature = req.header("x-square-hmacsha256-signature") ?? "";
  const rawBody = typeof req.body === "string" ? req.body : "";
  if (!signatureKey || !notificationUrl || !verifySquareSignature(rawBody, signature, signatureKey, notificationUrl)) {
    res.status(403).json({ error: "invalid signature" });
    return;
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: "invalid json" });
    return;
  }
  const event = parseSquareWebhookPayload(json);
  if (!event) {
    res.status(400).json({ error: "unsupported payload" });
    return;
  }
  if (!(await claimSquareWebhookEvent(event.eventId, event.eventType))) {
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }
  try {
    if (event.kind === "subscription") {
      await syncSquareSubscription(event.subscription.id, event.subscription.status as SquareSubscriptionStatus, event.subscription.paid_until_date ?? event.subscription.charged_through_date, event.subscription.customer_id);
    } else if (event.kind === "invoice_overdue") {
      await markMembershipInvoiceOverdue(event.customerId, event.createdAt);
    } else {
      await markMembershipInvoicePaid(event.customerId);
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    await releaseSquareWebhookEvent(event.eventId);
    console.error("[Square] Webhook processing failed", error);
    res.status(500).json({ error: "processing failed" });
  }
}
