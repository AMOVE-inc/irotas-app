import { describe, expect, it } from "vitest";
import { eventCategoryFromPrefecture, extractEventLocation, extractTokyoLocalArea, formatEventArea } from "../lib/event-location";

describe("event location", () => {
  it("extracts Tokyo and its detailed area from an address", () => {
    expect(extractEventLocation("東京都渋谷区恵比寿1-1-1")).toEqual({ prefecture: "東京都", tokyoArea: "ebisu-daikanyama-nakameguro" });
    expect(formatEventArea("東京都", "ebisu-daikanyama-nakameguro", "東京都渋谷区恵比寿1-1-1")).toBe("恵比寿");
    expect(formatEventArea("東京都", "ginza-yurakucho-hibiya", "東京都中央区銀座4-1")).toBe("銀座");
  });

  it("falls back to the other Tokyo area and derives broad regions", () => {
    expect(extractEventLocation("東京都文京区本郷1-1")).toEqual({ prefecture: "東京都", tokyoArea: "other" });
    expect(extractTokyoLocalArea("東京都文京区本郷1-1")).toBe("本郷");
    expect(formatEventArea("東京都", "other", "東京都文京区本郷1-1")).toBe("本郷");
    expect(eventCategoryFromPrefecture("大阪府")).toBe("kansai");
    expect(eventCategoryFromPrefecture("福岡県")).toBe("all");
  });
});
