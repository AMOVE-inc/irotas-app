import { describe, expect, it } from "vitest";
import {
  isStrictAdmin,
  SQUARE_SYNC_BATCH_SIZE,
  subscriptionAccessState,
} from "../sites/square-sync";

describe("Square subscription reconciliation", () => {
  it("keeps each synchronization batch below the worker subrequest limit", () => {
    expect(SQUARE_SYNC_BATCH_SIZE).toBe(40);
    expect(SQUARE_SYNC_BATCH_SIZE).toBeLessThan(50);
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
        "2026-08-18",
      ).accessStatus,
    ).toBe("suspended");
  });

  it("applies a seven-day grace period after paid-through date", () => {
    expect(
      subscriptionAccessState(
        { status: "ACTIVE", paid_until_date: "2026-08-15" },
        new Set(),
        "2026-08-18",
      ),
    ).toMatchObject({ accessStatus: "grace", graceUntil: "2026-08-22" });
    expect(
      subscriptionAccessState(
        { status: "ACTIVE", paid_until_date: "2026-08-10" },
        new Set(),
        "2026-08-18",
      ).accessStatus,
    ).toBe("suspended");
  });

  it("rejects subscriptions outside the configured plans", () => {
    expect(
      subscriptionAccessState(
        { status: "ACTIVE", plan_variation_id: "other" },
        new Set(["approved"]),
        "2026-08-18",
      ).accessStatus,
    ).toBe("suspended");
  });
});
