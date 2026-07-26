import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { claimSquareWebhookEvent, releaseSquareWebhookEvent, syncSquareSubscription } from "./db";
import type { SquareSubscriptionStatus } from "../lib/membership-access";

const subscriptionStatus = z.enum(["PENDING", "ACTIVE", "CANCELED", "DEACTIVATED", "PAUSED", "COMPLETED"]);
const payloadSchema = z.object({
  event_id: z.string().min(1),
  type: z.string().min(1),
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
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    res.status(400).json({ error: "unsupported payload" });
    return;
  }
  const event = parsed.data;
  if (!(await claimSquareWebhookEvent(event.event_id, event.type))) {
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }
  const subscription = event.data.object.subscription;
  try {
    await syncSquareSubscription(
      subscription.id,
      subscription.status as SquareSubscriptionStatus,
      subscription.paid_until_date ?? subscription.charged_through_date,
      subscription.customer_id,
    );
    res.status(200).json({ ok: true });
  } catch (error) {
    await releaseSquareWebhookEvent(event.event_id);
    console.error("[Square] Webhook processing failed", error);
    res.status(500).json({ error: "processing failed" });
  }
}
