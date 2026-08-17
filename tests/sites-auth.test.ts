import { describe, expect, it } from "vitest";
import {
  extractSessionToken,
  hashPassword,
  membershipAllowsAccess,
  normalizeEmail,
  verifyPassword,
} from "../sites/auth";
import { squareSignature } from "../sites/square-webhook";

describe("Sites production authentication", () => {
  it("normalizes billing email addresses", () => {
    expect(normalizeEmail("  Member@Example.COM ")).toBe("member@example.com");
  });

  it("hashes and verifies passwords without storing the plaintext", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    expect(encoded).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery staple", encoded)).toBe(
      true,
    );
    expect(await verifyPassword("wrong password", encoded)).toBe(false);
  });

  it("accepts a bearer token before a cookie token", () => {
    const request = new Request("https://example.com/api/auth/me", {
      headers: {
        authorization: "Bearer native-token",
        cookie: "irotas_session=web-token",
      },
    });
    expect(extractSessionToken(request)).toBe("native-token");
  });

  it("allows a seven-day overdue grace period but blocks paused members", () => {
    const member = {
      role: "user" as const,
      access_role: "member" as const,
      account_status: "active" as const,
    };
    const now = new Date("2026-08-17T00:00:00+09:00");
    expect(
      membershipAllowsAccess(
        {
          billing_email: "a@example.com",
          square_status: "ACTIVE",
          access_status: "grace",
          paid_until_date: null,
          grace_until_date: "2026-08-18",
        },
        member,
        now,
      ),
    ).toBe(true);
    expect(
      membershipAllowsAccess(
        {
          billing_email: "a@example.com",
          square_status: "PAUSED",
          access_status: "suspended",
          paid_until_date: null,
          grace_until_date: null,
        },
        member,
        now,
      ),
    ).toBe(false);
  });

  it("lets operators and club leaders sign in without a subscription", () => {
    expect(
      membershipAllowsAccess(null, {
        role: "operator",
        access_role: "operator",
        account_status: "active",
      }),
    ).toBe(true);
    expect(
      membershipAllowsAccess(null, {
        role: "user",
        access_role: "club_leader",
        account_status: "active",
      }),
    ).toBe(true);
  });

  it("produces the Square HMAC signature format", async () => {
    const signature = await squareSignature(
      '{"event_id":"evt-1"}',
      "secret",
      "https://example.com/api/webhooks/square",
    );
    expect(signature).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
});
