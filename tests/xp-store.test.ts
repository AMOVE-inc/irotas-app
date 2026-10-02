import { describe, expect, it } from "vitest";
import { getLevelFromXp, mergeXpRewards, type XpReward } from "../lib/xp-store";

describe("XP level", () => {
  it("50 XPごとにレベルが上がる", () => {
    expect(getLevelFromXp(0)).toBe(1);
    expect(getLevelFromXp(49)).toBe(1);
    expect(getLevelFromXp(50)).toBe(2);
    expect(getLevelFromXp(620)).toBe(13);
  });
});

describe("XP reward popup", () => {
  it("投稿XPと初回ミッションXPを1回の表示にまとめる", () => {
    const post: XpReward = { amount: 30, reason: "ごちそうさま報告投稿", previousXp: 40, nextXp: 70, previousLevel: 1, nextLevel: 2, previousRank: "regular", nextRank: "regular" };
    const mission: XpReward = { amount: 10, reason: "「ごちそうさま報告を投稿する」達成ボーナス", previousXp: 70, nextXp: 80, previousLevel: 2, nextLevel: 2, previousRank: "regular", nextRank: "silver", rankPointAward: { rank: "silver", amount: 100, balance: 100 } };
    expect(mergeXpRewards(post, mission)).toEqual({
      ...mission,
      amount: 40,
      reason: "ごちそうさま報告投稿・「ごちそうさま報告を投稿する」達成ボーナス",
      previousXp: 40,
      previousLevel: 1,
      previousRank: "regular",
    });
  });

  it("片方だけ付与された場合はその報酬をそのまま表示する", () => {
    const reward: XpReward = { amount: 10, reason: "達成ボーナス", previousXp: 0, nextXp: 10, previousLevel: 1, nextLevel: 1, previousRank: "regular", nextRank: "regular" };
    expect(mergeXpRewards(null, reward)).toBe(reward);
    expect(mergeXpRewards(reward, null)).toBe(reward);
  });
});
