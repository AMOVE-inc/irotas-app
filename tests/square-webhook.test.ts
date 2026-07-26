import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySquareSignature } from "../server/square-webhook";

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
