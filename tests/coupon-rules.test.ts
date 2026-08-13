import { describe, expect, it } from "vitest";
import { getCouponAvailability, localDateKey } from "../lib/coupon-rules";
import type { Coupon } from "../constants/mock-data";

const coupon: Coupon = {
  id: "coupon-test",
  title: "テストクーポン",
  description: "テスト",
  discount: "10%OFF",
  expiresAt: "2026-08-31",
  code: "TEST",
  requiredRank: "silver",
  usageType: "single",
};

describe("coupon availability", () => {
  it("allows an eligible unused member before expiration", () => {
    expect(getCouponAvailability(coupon, "gold", undefined, new Date(2026, 6, 22))).toBe("available");
  });

  it("blocks expired coupons from presentation", () => {
    expect(getCouponAvailability(coupon, "gold", undefined, new Date(2026, 8, 1))).toBe("expired");
  });

  it("blocks a coupon ended by an administrator", () => {
    expect(getCouponAvailability({ ...coupon, status: "ended" }, "gold", undefined, new Date(2026, 6, 22))).toBe("expired");
  });

  it("blocks members below the required rank", () => {
    expect(getCouponAvailability(coupon, "regular", undefined, new Date(2026, 6, 22))).toBe("rank_locked");
  });

  it("blocks a used single-use coupon", () => {
    expect(getCouponAvailability(coupon, "gold", { useCount: 1, usedAt: "2026-07-20T10:00:00Z" }, new Date(2026, 6, 22))).toBe("used");
  });

  it("keeps a multiple-use coupon available after use", () => {
    expect(getCouponAvailability({ ...coupon, usageType: "multiple" }, "gold", { useCount: 3, usedAt: "2026-07-20T10:00:00Z" }, new Date(2026, 6, 22))).toBe("available");
  });

  it("formats local calendar dates without UTC rollover", () => {
    expect(localDateKey(new Date(2026, 0, 2, 1, 0, 0))).toBe("2026-01-02");
  });
});
