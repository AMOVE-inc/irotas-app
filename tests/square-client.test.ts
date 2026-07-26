import { describe, expect, it } from "vitest";
import { selectSquareSubscription } from "../server/square-client";

describe("selectSquareSubscription", () => {
  it("prefers an active subscription over a newer canceled subscription", () => {
    const selected = selectSquareSubscription([
      { id: "canceled", customer_id: "customer", status: "CANCELED", created_at: "2026-07-01" },
      { id: "active", customer_id: "customer", status: "ACTIVE", created_at: "2025-01-01" },
    ], new Set());
    expect(selected?.id).toBe("active");
  });

  it("only considers configured IRO+ plans", () => {
    const selected = selectSquareSubscription([
      { id: "other", customer_id: "customer", plan_variation_id: "OTHER", status: "ACTIVE" },
      { id: "iro", customer_id: "customer", plan_variation_id: "IRO", status: "PAUSED" },
    ], new Set(["IRO"]));
    expect(selected?.id).toBe("iro");
  });

  it("returns undefined when no configured plan matches", () => {
    expect(selectSquareSubscription([
      { id: "other", customer_id: "customer", plan_variation_id: "OTHER", status: "ACTIVE" },
    ], new Set(["IRO"]))).toBeUndefined();
  });
});
