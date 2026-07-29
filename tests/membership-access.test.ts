import { describe, expect, it } from "vitest";
import { accessStatusForSquareStatus, canAccessMemberApp, canBypassSubscription } from "../lib/membership-access";

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

  it("exempts admins, operators and club leaders from subscription checks", () => {
    expect(canBypassSubscription("admin", "member")).toBe(true);
    expect(canBypassSubscription("operator", "member")).toBe(true);
    expect(canBypassSubscription("user", "club_leader")).toBe(true);
    expect(canBypassSubscription("user", "member")).toBe(false);
  });
});
