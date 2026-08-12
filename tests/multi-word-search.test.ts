import { describe, expect, it } from "vitest";
import { matchesAllSearchWords } from "../lib/multi-word-search";

describe("multi-word search", () => {
  it("matches restaurant names and areas across multiple words", () => {
    expect(matchesAllSearchWords("恵比寿 イタリアン", ["トラットリア IRO", "東京都渋谷区恵比寿", "イタリアン"])).toBe(true);
    expect(matchesAllSearchWords("恵比寿 焼肉", ["トラットリア IRO", "東京都渋谷区恵比寿", "イタリアン"])).toBe(false);
  });

  it("normalizes full-width text and spaces", () => {
    expect(matchesAllSearchWords("ＩＲＯ　東京", ["iro cafe", "東京都港区"])).toBe(true);
  });
});
