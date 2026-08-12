import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseSquareWebhookPayload, verifySquareSignature } from "../server/square-webhook";

describe("Square webhook signature", () => {
  it("validates the notification URL and unmodified raw request body", () => {
    const body = JSON.stringify({ event_id: "event-1" });
    const url = "https://example.com/api/webhooks/square";
    const key = "signature-key";
    const signature = createHmac("sha256", key).update(url + body).digest("base64");
    expect(verifySquareSignature(body, signature, key, url)).toBe(true);
    expect(verifySquareSignature(`${body} `, signature, key, url)).toBe(false);
  });
});

describe("Square webhook payload", () => {
  it("recognizes failed invoice payments as the beginning of the grace period", () => {
    expect(parseSquareWebhookPayload({ event_id: "e1", type: "invoice.scheduled_charge_failed", created_at: "2026-08-13T00:00:00Z", data: { object: { invoice: { primary_recipient: { customer_id: "C1" } } } } })).toMatchObject({ kind: "invoice_overdue", customerId: "C1" });
  });

  it("recognizes a successful invoice payment", () => {
    expect(parseSquareWebhookPayload({ event_id: "e2", type: "invoice.payment_made", data: { object: { invoice: { primary_recipient: { customer_id: "C1" } } } } })).toMatchObject({ kind: "invoice_paid", customerId: "C1" });
  });
});
