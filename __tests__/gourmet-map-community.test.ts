import { describe, expect, it } from "vitest";
import { CURRENT_USER, type BoardThread } from "../constants/mock-data";
import { communityRestaurantFromMealReport } from "../lib/gourmet-map-community";

const report = (rating: number, googleMapUrl?: string): BoardThread => ({
  id: "report-1",
  title: "今日のごちそうさま報告",
  author: CURRENT_USER,
  category: "meal-report",
  commentCount: 0,
  lastUpdated: "2026-08-12T00:00:00+09:00",
  preview: "おいしかったです",
  isRecruiting: false,
  mealReport: { restaurantName: "テスト店", prefecture: "東京都", rating, googleMapUrl },
});

describe("communityRestaurantFromMealReport", () => {
  it("星4以上かつGoogleマップURLがある投稿を登録対象にする", () => {
    expect(communityRestaurantFromMealReport(report(4, "https://maps.app.goo.gl/test"))?.restaurantName).toBe("テスト店");
  });

  it("星4未満を対象外にする", () => {
    expect(communityRestaurantFromMealReport(report(3, "https://maps.app.goo.gl/test"))).toBeNull();
  });

  it("GoogleマップURLがない投稿を対象外にする", () => {
    expect(communityRestaurantFromMealReport(report(5))).toBeNull();
  });
});
