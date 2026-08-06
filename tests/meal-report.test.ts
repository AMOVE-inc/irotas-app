import { describe, expect, it } from "vitest";
import { isGoogleMapsUrl, MEAL_BUDGETS, MEAL_REPORT_AREAS, PREFECTURES } from "../lib/meal-report";

describe("meal report format", () => {
  it("contains every prefecture and the fixed budget choices", () => {
    expect(PREFECTURES).toHaveLength(47);
    expect(PREFECTURES).toContain("東京都");
    expect(PREFECTURES).toContain("大阪府");
    expect(MEAL_BUDGETS[0]).toBe("〜¥999");
    expect(MEAL_BUDGETS[1]).toBe("¥1,000〜¥2,000");
    expect(MEAL_BUDGETS.at(-1)).toBe("¥30,000〜");
    expect(MEAL_REPORT_AREAS).toContain("関東 東京");
    expect(MEAL_REPORT_AREAS).toContain("東京 恵比寿・代官山・中目黒");
  });

  it("accepts Google Maps links only", () => {
    expect(isGoogleMapsUrl("https://maps.app.goo.gl/abc123")).toBe(true);
    expect(isGoogleMapsUrl("https://www.google.com/maps/place/example")).toBe(true);
    expect(isGoogleMapsUrl("https://example.com/maps")).toBe(false);
    expect(isGoogleMapsUrl("not-a-url")).toBe(false);
  });
});
