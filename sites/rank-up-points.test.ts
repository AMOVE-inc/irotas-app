import { describe, expect, it } from "vitest";
import { RANK_UP_POINT_BONUSES, rankUpPointBonus } from "./rank-up-points";

describe("rankUpPointBonus", () => {
  it("ランク初回到達時の特典額を返す", () => {
    expect(RANK_UP_POINT_BONUSES).toEqual({ silver: 500, gold: 1000, platinum: 2000 });
    expect(rankUpPointBonus("regular", "silver")).toBe(500);
    expect(rankUpPointBonus("silver", "gold")).toBe(1000);
    expect(rankUpPointBonus("gold", "platinum")).toBe(2000);
  });

  it("同一ランク・ランクダウンでは特典を付与しない", () => {
    expect(rankUpPointBonus("silver", "silver")).toBe(0);
    expect(rankUpPointBonus("gold", "silver")).toBe(0);
    expect(rankUpPointBonus("platinum", "regular")).toBe(0);
  });
});
