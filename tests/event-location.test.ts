import { describe, expect, it } from "vitest";
import { eventCategoryFromPrefecture, extractEventLocation, formatEventArea } from "../lib/event-location";

describe("event location", () => {
  it("extracts Tokyo and its detailed area from an address", () => {
    expect(extractEventLocation("東京都渋谷区恵比寿1-1-1")).toEqual({ prefecture: "東京都", tokyoArea: "ebisu-daikanyama-nakameguro" });
    expect(formatEventArea("東京都", "ebisu-daikanyama-nakameguro")).toBe("恵比寿・代官山・中目黒");
  });

  it("falls back to the other Tokyo area and derives broad regions", () => {
    expect(extractEventLocation("東京都文京区本郷1-1")).toEqual({ prefecture: "東京都", tokyoArea: "other" });
    expect(eventCategoryFromPrefecture("大阪府")).toBe("kansai");
    expect(eventCategoryFromPrefecture("福岡県")).toBe("all");
  });
});
