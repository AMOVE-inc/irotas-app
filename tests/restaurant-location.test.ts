import { describe, expect, it } from "vitest";
import { mealReportAreaFromAddress } from "../lib/restaurant-location";

describe("mealReportAreaFromAddress", () => {
  it("東京の住所から詳細エリアを抽出する", () => {
    expect(mealReportAreaFromAddress("東京都渋谷区恵比寿1-1-1")).toBe("関東｜東京｜恵比寿・代官山・中目黒");
  });

  it("東京以外の関東をまとめる", () => {
    expect(mealReportAreaFromAddress("神奈川県横浜市西区")).toBe("関東｜東京以外");
  });

  it("関西をまとめる", () => {
    expect(mealReportAreaFromAddress("大阪府大阪市北区梅田")).toBe("関西");
  });

  it("該当しない住所はその他にする", () => {
    expect(mealReportAreaFromAddress("福岡県福岡市博多区")).toBe("その他");
  });
});
