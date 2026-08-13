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
};

export function getLevelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.max(0, xp) / 50) + 1);
}

export async function awardXp(baseXp: number, amount: number, reason: string): Promise<XpReward> {
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
