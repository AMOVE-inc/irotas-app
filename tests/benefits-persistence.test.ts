import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { handleBenefitsRequest } from "../sites/benefits";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

function database(): D1Database {
  return {
    prepare(sql: string) {
      const statement: D1PreparedStatement = {
        bind() { return statement; },
        async first<T>() {
          if (sql.includes("FROM member_sessions")) return {
            id: 1, role: "user", access_role: "member", account_status: "active",
            email: "member@example.com", password_hash: null, display_name: "会員",
            branches_json: "[]", public_member_id: "IRO0001", member_term: "1期生",
            member_rank: "gold", discord_roles_json: "[]", achievement_badges_json: "[]",
            profile_json: "{}", xp: 0, participation_count: 0, organizer_count: 0,
            subscription_started_at: "2026-01-01", billing_email: "member@example.com",
            square_status: "ACTIVE", access_status: "active", paid_until_date: null,
            grace_until_date: null,
          } as T;
          if (sql.includes("SELECT member_rank")) return { member_rank: "gold" } as T;
          return null;
        },
        async run() { return { success: true }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
      return statement;
    },
    async batch() { return []; },
  };
}

describe("benefits and IRO+ points persistence", () => {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0014_benefits_points.sql"), "utf8");

  it("creates server-side coupon, lottery and points ledgers", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS coupon_usages");
    expect(migration).toContain("UNIQUE(campaign_id, member_id)");
    expect(migration).toContain("idempotency_key TEXT NOT NULL UNIQUE");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS irotas_point_operation_requests");
    expect(migration).toContain("status TEXT NOT NULL DEFAULT 'pending'");
    expect(migration).toContain("SET value = '15'");
  });

  it("requires login for benefits data", async () => {
    const response = await handleBenefitsRequest(new Request("https://app.example/api/benefits"), { DB: database(), AUTH_SECRET: "test" } as SitesEnv);
    expect(response?.status).toBe(401);
  });

  it("returns only the signed-in member's benefit state to a member", async () => {
    const response = await handleBenefitsRequest(new Request("https://app.example/api/benefits", { headers: { cookie: "__Host-irotas_session=test-session" } }), { DB: database(), AUTH_SECRET: "test" } as SitesEnv);
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({ memberRank: "gold", coupons: [], gifts: [], points: { balance: 0 } });
  });
});

describe("event fee point discounts", () => {
  it("stores event point usage and refunds it idempotently", () => {
    const migration = readFileSync(resolve(process.cwd(), "drizzle/0019_event_point_discounts.sql"), "utf8");
    const service = readFileSync(resolve(process.cwd(), "sites/event-points.ts"), "utf8");
    const events = readFileSync(resolve(process.cwd(), "sites/events.ts"), "utf8");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS event_point_usages");
    expect(migration).toContain("PRIMARY KEY(event_id, member_id)");
    expect(migration).toContain("'20'");
    expect(service).toContain("event-discount-refund:");
    expect(events).toContain("pointsToUse");
    expect(events).toContain("refundEventPointDiscount");
  });
});
