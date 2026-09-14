import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAuthRequest } from "../sites/auth";

afterEach(() => vi.restoreAllMocks());

function fixture(mode: "limited" | "ineligible" | "delivery-failure") {
  const queries: string[] = [];
  const db = { prepare(query: string) {
    queries.push(query);
    return { bind() { return {
      async first() {
        if (query.includes("FROM auth_rate_limits")) return mode === "limited"
          ? { window_started_at: new Date().toISOString(), attempt_count: 5 } : null;
        if (query.includes("FROM member_subscriptions WHERE")) return mode === "ineligible"
          ? null : { square_status: "ACTIVE", access_status: "active" };
        if (query.includes("FROM members m")) return { id: 123, role: "user", access_role: "member", account_status: "active" };
        return null;
      },
      async run() { return { success: true }; },
    }; } };
  } };
  const send = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const run = () => handleAuthRequest(new Request("https://example.test/api/auth/request-setup-code", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://example.test" },
    body: JSON.stringify({ email: "member@example.test" }),
  }), { DB: db, AUTH_SECRET: "test-secret", RESEND_API_KEY: "test-key", AUTH_EMAIL_FROM: "test@example.test" } as never);
  return { run, send, log, queries };
}

describe("setup code delivery outcomes", () => {
  it("reports rate limits instead of claiming success without sending", async () => {
    const f = fixture("limited");
    const response = await f.run();
    expect(response?.status).toBe(429);
    expect(f.send).not.toHaveBeenCalled();
    expect(f.log.mock.calls[0][0]).toContain("email_rate_limited");
  });
  it("sends verification even when membership has not been imported", async () => {
    const f = fixture("ineligible");
    f.send.mockResolvedValue(new Response(null, { status: 202 }));
    const response = await f.run();
    expect(await response?.json()).toEqual({ success: true });
    expect(f.send).toHaveBeenCalledOnce();
    expect(f.log.mock.calls[0][0]).toContain("provider_accepted");
    expect(f.log.mock.calls[0][0]).not.toContain("member@example.test");
    expect(f.queries.some(q => q.includes("INSERT INTO email_verification_codes"))).toBe(true);
  });
  it("reports delivery failure and removes the unusable code", async () => {
    const f = fixture("delivery-failure");
    const response = await f.run();
    expect(response?.status).toBe(503);
    expect(f.send).toHaveBeenCalledOnce();
    expect(f.queries.some(q => q.includes("DELETE FROM email_verification_codes"))).toBe(true);
    expect(f.log.mock.calls[0][0]).toContain("delivery_failed");
  });
});
