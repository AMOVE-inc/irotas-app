import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("web event application confirmation", () => {
  it("uses a browser confirmation that continues to the application request", () => {
    const source = readFileSync("app/event-detail.tsx", "utf8");
    expect(source).toContain('Platform.OS === "web"');
    expect(source).toContain("window.confirm(`${title}");
    expect(source).toContain("buttons.find");
  });
});
