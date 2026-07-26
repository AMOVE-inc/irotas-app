import { describe, expect, it } from "vitest";
import { accessStatusForSquareStatus, canAccessMemberApp } from "../lib/membership-access";

describe("membership access", () => {
  it("allows an active paid member", () => {
    expect(canAccessMemberApp({ squareStatus: "ACTIVE", accessStatus: "active", paidUntilDate: "2026-07-31" }, new Date("2026-07-26T12:00:00+09:00"))).toBe(true);
  });

  it("blocks stopped subscriptions and expired paid periods", () => {
    expect(canAccessMemberApp({ squareStatus: "CANCELED", accessStatus: "suspended" })).toBe(false);
    expect(canAccessMemberApp({ squareStatus: "ACTIVE", accessStatus: "active", paidUntilDate: "2026-07-20" }, new Date("2026-07-26T12:00:00+09:00"))).toBe(false);
  });

  it("supports a bounded payment grace period", () => {
    expect(canAccessMemberApp({ squareStatus: "ACTIVE", accessStatus: "grace", graceUntilDate: "2026-07-28" }, new Date("2026-07-26T12:00:00+09:00"))).toBe(true);
    expect(accessStatusForSquareStatus("PAUSED")).toBe("suspended");
  });
});
