import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("web event application confirmation", () => {
  it("uses the designed in-app confirmation while official-event payments are paused", () => {
    const source = readFileSync("app/event-detail.tsx", "utf8");
    expect(source).toContain("applicationConfirmation !== null");
    expect(source).toContain("const OFFICIAL_EVENT_PAYMENTS_ENABLED = false");
    expect(source).toContain("現在、アプリ内決済は行いません");
    expect(source).toContain("OFFICIAL_EVENT_PAYMENTS_ENABLED && isOfficialEvent && priceNum > 0");
    expect(source).not.toContain("window.confirm");
  });
});
