import { describe, expect, it } from "vitest";
import {
  extractSessionToken,
  hashPassword,
  emailDeliveryConfigured,
  membershipAllowsAccess,
  normalizeEmail,
  isTrustedBrowserOrigin,
  isBootstrapAdminEmail,
  normalizeBranchSelection,
  verifyPassword,
} from "../sites/auth";
import {
  preserveOverdueGrace,
  squareBillingEvent,
  squareSignature,
} from "../sites/square-webhook";

describe("Sites production authentication", () => {
  it("normalizes billing email addresses", () => {
    expect(normalizeEmail("  Member@Example.COM ")).toBe("member@example.com");
  });

  it("only recognizes the exact configured bootstrap administrator email", () => {
    const env = { BOOTSTRAP_ADMIN_EMAIL: " Admin@Example.COM " } as never;
    expect(isBootstrapAdminEmail(env, "admin@example.com")).toBe(true);
    expect(isBootstrapAdminEmail(env, "member@example.com")).toBe(false);
    expect(isBootstrapAdminEmail({} as never, "admin@example.com")).toBe(false);
  });

  it("accepts only unique supported branch selections", () => {
    expect(normalizeBranchSelection(["kanto"])).toEqual(["kanto"]);
    expect(normalizeBranchSelection(["kanto", "kansai"])).toEqual([
      "kanto",
      "kansai",
    ]);
    expect(normalizeBranchSelection([])).toBeNull();
    expect(normalizeBranchSelection(["kanto", "kanto"])).toBeNull();
    expect(normalizeBranchSelection(["unknown"])).toBeNull();
  });

  it("hashes and verifies passwords without storing the plaintext", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    expect(encoded).not.toContain("correct horse");
    expect(encoded).toContain("$100000$");
    expect(await verifyPassword("correct horse battery staple", encoded)).toBe(
      true,
    );
    expect(await verifyPassword("wrong password", encoded)).toBe(false);
  });

  it("uses the server secret as a password pepper in production hashes", async () => {
    const encoded = await hashPassword(
      "correct horse battery staple",
      undefined,
      "server-side-secret",
    );
    expect(encoded.startsWith("pbkdf2_sha256_hmac$100000$")).toBe(true);
    expect(
      await verifyPassword(
        "correct horse battery staple",
        encoded,
        "server-side-secret",
      ),
    ).toBe(true);
    expect(
      await verifyPassword(
        "correct horse battery staple",
        encoded,
        "different-secret",
      ),
    ).toBe(false);
    expect(
      await verifyPassword("correct horse battery staple", encoded),
    ).toBe(false);
  });

  it("accepts a bearer token before a cookie token", () => {
    const request = new Request("https://example.com/api/auth/me", {
      headers: {
        authorization: "Bearer native-token",
        cookie: "__Host-irotas_session=web-token",
      },
    });
    expect(extractSessionToken(request)).toBe("native-token");
  });

  it("rejects cross-origin browser mutations while allowing native requests", () => {
    expect(
      isTrustedBrowserOrigin(
        new Request("https://app.example/api/auth/login", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toBe(false);
    expect(
      isTrustedBrowserOrigin(new Request("https://app.example/api/auth/login")),
    ).toBe(true);
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

  it("does not clear payment-failure grace on a later active subscription update", () => {
    expect(preserveOverdueGrace("active", "grace", "2026-08-25")).toEqual({
      accessStatus: "grace",
      graceUntil: "2026-08-25",
    });
    expect(preserveOverdueGrace("active", "suspended", null)).toEqual({
      accessStatus: "active",
      graceUntil: null,
    });
    expect(preserveOverdueGrace("suspended", "grace", "2026-08-25")).toEqual({
      accessStatus: "suspended",
      graceUntil: null,
    });
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

  it("accepts either a private email webhook or a configured Resend sender", () => {
    expect(emailDeliveryConfigured({} as never)).toBe(false);
    expect(
      emailDeliveryConfigured({
        RESEND_API_KEY: "re_test",
        AUTH_EMAIL_FROM: "IRO+ <app@example.com>",
      } as never),
    ).toBe(true);
  });

  it("recognizes failed Square subscription payments for the grace period", () => {
    expect(
      squareBillingEvent({
        type: "payment.updated",
        data: {
          object: {
            payment: { status: "FAILED", customer_id: "CUSTOMER-1" },
          },
        },
      }),
    ).toEqual({ kind: "overdue", customerId: "CUSTOMER-1" });
    expect(
      squareBillingEvent({
        type: "payment.updated",
        data: {
          object: {
            payment: { status: "COMPLETED", customer_id: "CUSTOMER-1" },
          },
        },
      }),
    ).toBeNull();
  });
});
