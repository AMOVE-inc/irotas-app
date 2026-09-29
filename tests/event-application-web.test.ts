import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("web event application confirmation", () => {
  it("gates official-event payments behind the public build flag", () => {
    const source = readFileSync("app/event-detail.tsx", "utf8");
    expect(source).toContain("applicationConfirmation !== null");
    expect(source).toContain('process.env.EXPO_PUBLIC_EVENT_PAYMENTS_ENABLED === "true"');
    expect(source).toContain('OFFICIAL_EVENT_PAYMENTS_ENABLED && isOfficialEvent && event.paymentTiming !== "postpaid" && priceNum > 0');
    expect(source).not.toContain("window.confirm");
  });
});
