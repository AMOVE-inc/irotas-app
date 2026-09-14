import { afterEach, expect, it, vi } from "vitest";
import { handleAuthRequest } from "../sites/auth";
afterEach(() => vi.restoreAllMocks());
it("verifies the mailbox before discovering and registering an unimported Square member", async () => {
  let storedCode: any = null;
  let subscription: any = null;
  let member: any = null;
  const db: any = { prepare(query: string) { return { bind(...values: any[]) { return {
    async first() {
      if (query.includes("FROM email_verification_codes")) return storedCode;
      if (query.includes("FROM member_subscriptions WHERE")) return subscription;
      if (query.includes("FROM members m")) return member;
      return null;
    },
    async run() {
      if (query.includes("INSERT INTO email_verification_codes")) storedCode = { id: 1, code_hash: values[1], expires_at: values[2], failed_attempts: 0 };
      if (query.includes("INSERT INTO member_subscriptions")) subscription = { square_status: "ACTIVE", access_status: "active" };
      if (query.includes("INSERT INTO members")) member = { id: 1, email: values[0], display_name: values[1], role: "user", access_role: "member", account_status: "active", branches_json: "[]" };
      return { success: true };
    },
  }; } }; }, async batch(statements: any[]) { return Promise.all(statements.map(s => s.run())); } };
  let code = "";
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    if (String(url).includes("resend.com")) {
      code = JSON.parse(String(options?.body)).text.match(/\d{6}/)[0];
      return Response.json({ id: "mail-1" });
    }
    if (String(url).includes("customers/search")) return Response.json({ customers: [{ id: "customer-1", email_address: "member@example.test" }] });
    return Response.json({ subscriptions: [{ id: "sub-1", customer_id: "customer-1", status: "ACTIVE", plan_variation_id: "membership" }] });
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
  const env: any = { DB: db, AUTH_SECRET: "secret", AUTH_EMAIL_FROM: "app@example.test", RESEND_API_KEY: "test", SQUARE_ACCESS_TOKEN: "test", SQUARE_ALLOWED_PLAN_VARIATION_IDS: "membership" };
  const request = (route: string, body: any) => handleAuthRequest(new Request(`https://example.test/api/auth/${route}`, { method: "POST", headers: { "content-type": "application/json", origin: "https://example.test" }, body: JSON.stringify(body) }), env);
  expect((await request("request-setup-code", { email: "member@example.test" }))?.status).toBe(200);
  expect(member).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  const wrongCode = code === "000000" ? "000001" : "000000";
  expect((await request("register", { email: "member@example.test", verificationCode: wrongCode, password: "test-password" }))?.status).toBe(400);
  expect(fetch).toHaveBeenCalledTimes(1);
  const result = await request("register", { email: "member@example.test", verificationCode: code, password: "test-password" });
  expect(result?.status).toBe(200);
  expect(result?.headers.get("set-cookie")).toContain("__Host-irotas_session");
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(member.role).toBe("user");
});

it("keeps a passwordless Discord member linked through Square when its billing email changes", async () => {
  let codeHash = "";
  let expiresAt = "";
  let sentCode = "";
  let createdMembers = 0;
  const linkedMember: any = {
    id: 42, email: "old@example.test", password_hash: null,
    display_name: "Discord Member", role: "user", access_role: "member",
    account_status: "active", branches_json: "[]", profile_json: '{"bio":"Discord bio"}',
    discord_user_id: "1452696559845113987", member_term: "第7期", member_rank: "regular",
    discord_roles_json: "[]", achievement_badges_json: "[]", xp: 0,
    participation_count: 0, organizer_count: 0,
  };
  const subscription = { member_id: 42, billing_email: "new@example.test",
    square_status: "ACTIVE", access_status: "active", paid_until_date: null, grace_until_date: null };
  const db: any = {
    prepare(query: string) {
      return { bind(...values: any[]) {
        return {
          async first() {
            if (query.includes("FROM auth_rate_limits")) return null;
            if (query.includes("FROM email_verification_codes"))
              return { id: 1, code_hash: codeHash, expires_at: expiresAt, failed_attempts: 0 };
            if (query.includes("FROM member_subscriptions WHERE")) return subscription;
            if (query.includes("FROM members m") && query.includes("WHERE m.id = ?")) return linkedMember;
            if (query.includes("FROM members m")) return linkedMember.email === values[0] ? linkedMember : null;
            return null;
          },
          async run() {
            if (query.includes("INSERT INTO email_verification_codes")) { codeHash = values[1]; expiresAt = values[2]; }
            if (query.includes("INSERT INTO members")) createdMembers++;
            if (query.includes("UPDATE members SET email")) linkedMember.email = values[0];
            return { success: true, meta: { changes: 1 } };
          },
        };
      } };
    },
    async batch(statements: any[]) { return Promise.all(statements.map((statement) => statement.run())); },
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
    sentCode = JSON.parse(String(options?.body)).text.match(/\d{6}/)[0];
    return Response.json({ id: "mail-1" });
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
  const env: any = { DB: db, AUTH_SECRET: "secret", AUTH_EMAIL_FROM: "app@example.test", RESEND_API_KEY: "test" };
  const request = (route: string, body: any) => handleAuthRequest(new Request(`https://example.test/api/auth/${route}`, {
    method: "POST", headers: { "content-type": "application/json", origin: "https://example.test" }, body: JSON.stringify(body),
  }), env);
  expect((await request("request-setup-code", { email: "new@example.test" }))?.status).toBe(200);
  const response = await request("register", { email: "new@example.test", verificationCode: sentCode, password: "test-password" });
  expect(response?.status).toBe(200);
  expect((await response?.json())?.user).toMatchObject({ id: 42, profile: { bio: "Discord bio" } });
  expect(createdMembers).toBe(0);
  expect(linkedMember.email).toBe("new@example.test");
});
