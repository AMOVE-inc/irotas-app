import { describe, expect, it } from "vitest";
import { isGoogleMapsUrl, MEAL_BUDGETS, PREFECTURES } from "../lib/meal-report";

describe("meal report format", () => {
  it("contains every prefecture and the fixed budget choices", () => {
    expect(PREFECTURES).toHaveLength(47);
    expect(PREFECTURES).toContain("東京都");
    expect(PREFECTURES).toContain("大阪府");
    expect(MEAL_BUDGETS).toHaveLength(5);
  });

  it("accepts Google Maps links only", () => {
    expect(isGoogleMapsUrl("https://maps.app.goo.gl/abc123")).toBe(true);
    expect(isGoogleMapsUrl("https://www.google.com/maps/place/example")).toBe(true);
    expect(isGoogleMapsUrl("https://example.com/maps")).toBe(false);
    expect(isGoogleMapsUrl("not-a-url")).toBe(false);
  });
});
