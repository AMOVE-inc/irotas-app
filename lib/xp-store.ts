import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRankFromPoints, type MemberRank } from "../constants/mock-data";

const STORAGE_KEY = "irotas_xp_v1";

export type XpReward = {
  amount: number;
  reason: string;
  previousXp: number;
  nextXp: number;
  previousLevel: number;
  nextLevel: number;
  previousRank: MemberRank;
  nextRank: MemberRank;
  rankPointAward?: {
    rank: Extract<MemberRank, "silver" | "gold" | "platinum">;
    amount: number;
    balance: number;
  };
};

export function getLevelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.max(0, xp) / 50) + 1);
}

export function mergeXpRewards(first: XpReward | null, next: XpReward | null): XpReward | null {
  if (!first) return next;
  if (!next) return first;
  return {
    ...next,
    amount: first.amount + next.amount,
    reason: `${first.reason}・${next.reason}`,
    previousXp: first.previousXp,
    previousLevel: first.previousLevel,
    previousRank: first.previousRank,
  };
}

export type XpAction = "event_create" | "board_post" | "meal_report_post";
type SharedXpReward = Pick<XpReward, "amount" | "reason" | "previousXp" | "nextXp" | "previousRank" | "nextRank" | "rankPointAward">;

export async function awardXp(baseXp: number, amount: number, reason: string, remoteAward?: () => Promise<SharedXpReward>): Promise<XpReward> {
  if (remoteAward) {
    const reward = await remoteAward();
    return {
      ...reward,
      previousLevel: getLevelFromXp(reward.previousXp),
      nextLevel: getLevelFromXp(reward.nextXp),
    };
  }
  let previousXp = baseXp;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored !== null && Number.isFinite(Number(stored))) previousXp = Number(stored);
  } catch {
    // 保存領域が使えない場合も、その場の獲得表示は行う。
  }
  const nextXp = Math.max(0, previousXp + amount);
  try { await AsyncStorage.setItem(STORAGE_KEY, String(nextXp)); } catch {}
  return {
    amount, reason, previousXp, nextXp,
    previousLevel: getLevelFromXp(previousXp), nextLevel: getLevelFromXp(nextXp),
    previousRank: getRankFromPoints(previousXp), nextRank: getRankFromPoints(nextXp),
  };
}
