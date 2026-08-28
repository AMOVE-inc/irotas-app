import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("web event application confirmation", () => {
  it("uses the designed in-app confirmation and supports official-event points", () => {
    const source = readFileSync("app/event-detail.tsx", "utf8");
    expect(source).toContain("applicationConfirmation !== null");
    expect(source).toContain("イロタスポイントを使う");
    expect(source).toContain("isOfficialEvent && priceNum > 0");
    expect(source).not.toContain("window.confirm");
  });
});
