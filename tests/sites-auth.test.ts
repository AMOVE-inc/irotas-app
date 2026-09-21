import { describe, expect, it, vi } from "vitest";
import {
  extractSessionToken,
  hashPassword,
  emailDeliveryConfigured,
  membershipAllowsAccess,
  normalizeEmail,
  isTrustedBrowserOrigin,
  isBootstrapAdminEmail,
  hasDiscordStaffRole,
  normalizeBranchSelection,
  cleanMemberDisplayName,
  effectiveMemberRank,
  verifyPassword,
  handleAuthRequest,
} from "../sites/auth";
import {
  preserveOverdueGrace,
  squareBillingEvent,
  squareSignature,
} from "../sites/square-webhook";

describe("Sites production authentication", () => {
  it("clears the cookie before redirecting browser logout to login", async () => {
    const response = await handleAuthRequest(
      new Request("https://app.example/api/auth/logout?redirect=login", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
      }),
      { DB: {} } as never,
    );
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe("/login");
    expect(response?.headers.get("set-cookie")).toContain("__Host-irotas_session=;");
    expect(response?.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("normalizes billing email addresses", () => {
    expect(normalizeEmail("  Member@Example.COM ")).toBe("member@example.com");
  });

  it("sends a setup code when stored member and billing emails contain whitespace", async () => {
    const queries: string[] = [];
    const db = {
      prepare(query: string) {
        queries.push(query);
        return {
          bind(...values: unknown[]) {
            return {
              async first() {
                if (query.includes("FROM auth_rate_limits")) return null;
                if (query.includes("FROM member_subscriptions WHERE"))
                  return query.includes("LOWER(TRIM(billing_email))") && values[0] === "member@example.com"
                    ? { billing_email: " Member@Example.COM ", square_status: "ACTIVE", access_status: "active", paid_until_date: "2026-09-03", grace_until_date: null }
                    : null;
                if (query.includes("FROM members m"))
                  return query.includes("LOWER(TRIM(m.email))") && values[0] === "member@example.com"
                    ? { id: 1, email: " Member@Example.COM ", role: "user", access_role: "member", account_status: "active" }
                    : null;
                return null;
              },
              async run() { return { success: true }; },
            };
          },
        };
      },
    };
    const send = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    try {
      const response = await handleAuthRequest(
        new Request("https://app.example/api/auth/request-setup-code", {
          method: "POST",
          headers: { origin: "https://app.example", "content-type": "application/json" },
          body: JSON.stringify({ email: "member@example.com" }),
        }),
        { DB: db, AUTH_SECRET: "test-secret", RESEND_API_KEY: "test-key", AUTH_EMAIL_FROM: "test@example.com" } as never,
      );
      expect(response?.status).toBe(200);
      expect(send).toHaveBeenCalledOnce();
      expect(queries.some((query) => query.includes("INSERT INTO email_verification_codes"))).toBe(true);
    } finally {
      send.mockRestore();
    }
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

  it("uses the authenticated Discord member identity instead of demo rank decorations", () => {
    expect(cleanMemberDisplayName("Aoi【🥇GOLD 】")).toBe("Aoi");
    expect(cleanMemberDisplayName("みょん🍳料理教室部長 【💎PLATINUM 】")).toBe("みょん🍳料理教室部長");
    expect(effectiveMemberRank("regular", '["レギュラー会員","🥇GOLD会員"]')).toBe("gold");
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

  it("lets a verified operator replace an existing password and revokes old sessions", async () => {
    const secret = "test-secret";
    const email = "operator@example.com";
    const code = "123456";
    const oldHash = await hashPassword("old-password", undefined, secret);
    const verificationKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const verificationSignature = new Uint8Array(await crypto.subtle.sign(
      "HMAC",
      verificationKey,
      new TextEncoder().encode(`${email}:initial_setup:${code}`),
    ));
    const verificationHash = Buffer.from(verificationSignature).toString("base64url");
    const batchedQueries: string[] = [];
    const db = {
      prepare(query: string) {
        return {
          bind(..._values: unknown[]) {
            return {
              query,
              async first() {
                if (query.includes("FROM members m")) return {
                  id: 86,
                  email,
                  password_hash: oldHash,
                  display_name: "Operator",
                  role: "operator",
                  access_role: "operator",
                  branches_json: "[]",
                  account_status: "active",
                  last_signed_in_at: null,
                  password_set_at: "2026-09-01T00:00:00.000Z",
                  public_member_id: "IRO0086",
                  member_term: "第5期",
                  member_rank: "regular",
                  discord_roles_json: "[]",
                  achievement_badges_json: "[]",
                  profile_json: "{}",
                  xp: 0,
                  participation_count: 0,
                  organizer_count: 0,
                  subscription_started_at: null,
                };
                if (query.includes("FROM member_subscriptions")) return null;
                if (query.includes("FROM email_verification_codes")) return {
                  id: 250,
                  code_hash: verificationHash,
                  expires_at: "2999-01-01T00:00:00.000Z",
                  failed_attempts: 0,
                };
                return null;
              },
              async run() { return { success: true }; },
            };
          },
        };
      },
      async batch(statements: Array<{ query: string }>) {
        batchedQueries.push(...statements.map((statement) => statement.query));
        return statements.map(() => ({ success: true }));
      },
    };

    const response = await handleAuthRequest(
      new Request("https://app.example/api/auth/register", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({ email, password: "new-password", verificationCode: code }),
      }),
      { DB: db, AUTH_SECRET: secret } as never,
    );

    expect(response?.status).toBe(200);
    expect(batchedQueries.some((query) => query.includes("DELETE FROM member_sessions"))).toBe(true);
    expect(batchedQueries.some((query) => query.includes("UPDATE members SET password_hash"))).toBe(true);
    expect(batchedQueries.some((query) => query.includes("auth.password_reset"))).toBe(true);
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

  it("rejects malformed and oversized JSON bodies without a server error", async () => {
    const malformed = await handleAuthRequest(
      new Request("https://app.example/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json}",
      }),
      { DB: {} } as never,
    );
    expect(malformed?.status).toBe(400);
    expect(await malformed?.json()).toEqual({
      error: "正しいJSON形式で送信してください",
    });

    const oversized = await handleAuthRequest(
      new Request("https://app.example/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "a".repeat(33_000) }),
      }),
      { DB: {} } as never,
    );
    expect(oversized?.status).toBe(413);
    expect(await oversized?.json()).toEqual({
      error: "リクエストが大きすぎます",
    });
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

  it("allows a Square ACTIVE member when the charged-through date is stale", () => {
    expect(membershipAllowsAccess({
      billing_email: "member@example.com",
      square_status: "ACTIVE",
      access_status: "active",
      paid_until_date: "2026-09-03",
      grace_until_date: null,
    }, {
      role: "user",
      access_role: "member",
      account_status: "active",
    }, new Date("2026-09-13T12:00:00+09:00"))).toBe(true);
  });

  it("blocks an overdue paying member while exempting unpaid staff roles", () => {
    const subscription = {
      billing_email: "member@example.com", square_status: "ACTIVE",
      billing_status: "OVERDUE_BLOCKED", access_status: "active" as const,
      paid_until_date: null, grace_until_date: null,
    };
    expect(membershipAllowsAccess(subscription, { role: "user", access_role: "member", account_status: "active" })).toBe(false);
    expect(membershipAllowsAccess(subscription, { role: "user", access_role: "club_leader", account_status: "active" })).toBe(true);
    expect(membershipAllowsAccess(subscription, { role: "admin", access_role: "admin", account_status: "active" })).toBe(true);
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

  it("lets imported Discord operations roles sign in without a Square subscription", () => {
    expect(hasDiscordStaffRole('["🥇GOLD会員", "運営メンバー"]')).toBe(true);
    expect(
      membershipAllowsAccess(null, {
        role: "user",
        access_role: "member",
        account_status: "active",
        discord_roles_json: '["運営メンバー"]',
      }),
    ).toBe(true);
    expect(hasDiscordStaffRole('["🥇GOLD会員", "肉部長"]')).toBe(false);
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
