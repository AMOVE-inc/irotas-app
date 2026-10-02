import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isStrictAdmin,
  reconcileAllSquareSubscriptions,
  SQUARE_SEARCH_PAGE_SIZE,
  SQUARE_SYNC_BATCH_SIZE,
  shouldRunScheduledSquareSubscriptionSync,
  subscriptionAccessState,
} from "../sites/square-sync";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

afterEach(() => vi.restoreAllMocks());

describe("Square subscription reconciliation", () => {
  it("keeps each synchronization batch below the worker subrequest limit", () => {
    expect(SQUARE_SYNC_BATCH_SIZE).toBe(40);
    expect(SQUARE_SYNC_BATCH_SIZE).toBeLessThan(50);
  });

  it("runs the full fallback reconciliation once per hour", () => {
    expect(shouldRunScheduledSquareSubscriptionSync(Date.parse("2026-10-02T06:00:00Z"))).toBe(true);
    expect(shouldRunScheduledSquareSubscriptionSync(Date.parse("2026-10-02T06:15:00Z"))).toBe(false);
    expect(shouldRunScheduledSquareSubscriptionSync(Date.parse("2026-10-02T06:45:00Z"))).toBe(false);
  });

  it("allows administrators but not operators", () => {
    expect(isStrictAdmin({ role: "admin", access_role: "admin" })).toBe(true);
    expect(isStrictAdmin({ role: "user", access_role: "admin" })).toBe(true);
    expect(isStrictAdmin({ role: "operator", access_role: "operator" })).toBe(false);
    expect(isStrictAdmin({ role: "user", access_role: "club_leader" })).toBe(false);
  });

  it("blocks paused subscriptions immediately", () => {
    expect(
      subscriptionAccessState(
        { status: "PAUSED", paid_until_date: "2026-08-31" },
        new Set(),
      ).accessStatus,
    ).toBe("suspended");
  });

  it("does not revoke an ACTIVE subscription based only on a stale charged-through date", () => {
    expect(
      subscriptionAccessState(
        { status: "ACTIVE", paid_until_date: "2026-08-15" },
        new Set(),
      ),
    ).toMatchObject({ accessStatus: "active", graceUntil: null });
    expect(
      subscriptionAccessState(
        { status: "ACTIVE", paid_until_date: "2026-08-10" },
        new Set(),
      ).accessStatus,
    ).toBe("active");
  });

  it("rejects subscriptions outside the configured plans", () => {
    expect(
      subscriptionAccessState(
        { status: "ACTIVE", plan_variation_id: "other" },
        new Set(["approved"]),
      ).accessStatus,
    ).toBe("suspended");
  });

  it("periodically reconciles every Square subscription page", async () => {
    const writes: { sql: string; values: unknown[] }[] = [];
    const prepare = (sql: string): D1PreparedStatement => {
      let values: unknown[] = [];
      const statement: D1PreparedStatement = {
        bind: (...next) => { values = next; return statement; },
        first: async () => null,
        all: async () => ({ success: true, results: [] }),
        run: async () => { writes.push({ sql, values }); return { success: true }; },
      };
      Object.assign(statement, { __sql: sql, __values: () => values });
      return statement;
    };
    const db: D1Database = {
      prepare,
      batch: async (statements) => statements.map((statement) => {
        const tracked = statement as D1PreparedStatement & { __sql: string; __values: () => unknown[] };
        writes.push({ sql: tracked.__sql, values: tracked.__values() });
        return { success: true, meta: { changes: 1 } };
      }),
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ subscriptions: [{ id: "sub-active", status: "ACTIVE" }], cursor: "next" }))
      .mockResolvedValueOnce(Response.json({ subscriptions: [{ id: "sub-paused", status: "PAUSED" }] }));

    const result = await reconcileAllSquareSubscriptions({ DB: db, SQUARE_ACCESS_TOKEN: "token" } as SitesEnv);

    expect(result).toEqual({ skipped: false, scanned: 2, updated: 2, pages: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ limit: SQUARE_SEARCH_PAGE_SIZE });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ limit: SQUARE_SEARCH_PAGE_SIZE, cursor: "next" });
    expect(writes.some((write) => write.sql.includes("UPDATE member_subscriptions") && write.values.includes("PAUSED") && write.values.includes("suspended"))).toBe(true);
    expect(writes.some((write) => write.sql.includes("square.subscriptions_scheduled_reconciled"))).toBe(true);
  });
});
