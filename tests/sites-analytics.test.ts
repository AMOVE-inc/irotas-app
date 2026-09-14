import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleAnalyticsRequest } from "../sites/analytics";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

const { authenticatedRequestMember } = vi.hoisted(() => ({ authenticatedRequestMember: vi.fn() }));
vi.mock("../sites/auth", () => ({ authenticatedRequestMember }));

function analyticsDb() {
  const queries: string[] = [];
  const rows = [
    [{ key: "total", count: 4 }],
    [{ key: "male", count: 2 }, { key: "female", count: 1 }, { key: "unset", count: 1 }],
    [{ key: "regular", count: 3 }, { key: "gold", count: 1 }],
    [{ key: "kanto", count: 3 }, { key: "kansai", count: 2 }],
    [{ key: "2026-09", count: 2 }, { key: "2026-08", count: 2 }],
  ];
  const db: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      const index = queries.push(sql) - 1;
      const statement: D1PreparedStatement = {
        bind: () => statement,
        first: async () => null,
        run: async () => ({ success: true }),
        all: async <T>() => ({ success: true, results: (rows[index] ?? []) as T[] }),
      };
      return statement;
    },
    batch: async () => [],
  };
  return { db, queries };
}

describe("admin analytics", () => {
  beforeEach(() => authenticatedRequestMember.mockReset());

  it("requires an authenticated admin before querying member data", async () => {
    const { db, queries } = analyticsDb();
    const env: SitesEnv = { DB: db, ASSETS: { fetch: vi.fn() } };
    const request = new Request("https://app.example/api/admin/analytics");
    authenticatedRequestMember.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 2, role: "user", access_role: "member" });
    expect((await handleAnalyticsRequest(request, env))?.status).toBe(401);
    expect((await handleAnalyticsRequest(request, env))?.status).toBe(403);
    expect(queries).toHaveLength(0);
  });

  it("returns aggregate counts from eligible members without listing individual profiles", async () => {
    const { db, queries } = analyticsDb();
    authenticatedRequestMember.mockResolvedValue({ id: 1, role: "admin", access_role: "admin" });
    const response = await handleAnalyticsRequest(new Request("https://app.example/api/admin/analytics"), { DB: db, ASSETS: { fetch: vi.fn() } });
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      totalMembers: 4,
      genderCounts: { male: 2, female: 1, unset: 1 },
      rankCounts: { regular: 3, gold: 1 },
      branchCounts: { kanto: 3, kansai: 2 },
      monthlyJoins: { "2026-09": 2, "2026-08": 2 },
    });
    expect(queries).toHaveLength(5);
    expect(queries.every((sql) => sql.includes("account_status = 'active'") && sql.includes("isTestAccount"))).toBe(true);
  });
});
