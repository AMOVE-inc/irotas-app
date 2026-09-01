import type { MemberRank } from "@/constants/mock-data";

/**
 * IRO+ XP curve from the 2026-09-11 cutover.
 * The first level needs 100 XP and every following level costs 100 XP more.
 */
export function xpRequiredForNextLevel(level: number): number {
  return 100 * (Math.max(0, Math.floor(level)) + 1);
}

/** Total XP needed to have reached a level. */
export function totalXpForLevel(level: number): number {
  const normalizedLevel = Math.max(0, Math.floor(level));
  return 50 * normalizedLevel * (normalizedLevel + 1);
}

export function levelFromXp(xp: number): number {
  const normalizedXp = Math.max(0, Math.floor(xp));
  return Math.max(0, Math.floor((Math.sqrt(1 + normalizedXp / 12.5) - 1) / 2));
}

export function rankFromLevel(level: number): MemberRank {
  if (level >= 15) return "platinum";
  if (level >= 10) return "gold";
  if (level >= 5) return "silver";
  return "regular";
}

export function rankFromXp(xp: number): MemberRank {
  return rankFromLevel(levelFromXp(xp));
}

/**
 * Temporary floor used while the one-time MEE6 cutover is pending.  A member
 * who already holds a membership rank must never appear as Lv.0 / 0 XP just
 * because their MEE6 total has not been imported yet.
 */
export function minimumXpForRank(rank: MemberRank | string | null | undefined): number {
  switch (rank) {
    case "platinum": return totalXpForLevel(15);
    case "gold": return totalXpForLevel(10);
    case "silver": return totalXpForLevel(5);
    default: return 0;
  }
}

export function getNextLevelInfo(xp: number) {
  const normalizedXp = Math.max(0, Math.floor(xp));
  const currentLevel = levelFromXp(normalizedXp);
  const levelStartXp = totalXpForLevel(currentLevel);
  const xpForNextLevel = xpRequiredForNextLevel(currentLevel);
  const nextLevelXp = levelStartXp + xpForNextLevel;
  return {
    currentLevel,
    nextLevel: currentLevel + 1,
    xpIntoLevel: normalizedXp - levelStartXp,
    xpForNextLevel,
    pointsNeeded: nextLevelXp - normalizedXp,
    progress: Math.min(Math.max((normalizedXp - levelStartXp) / xpForNextLevel, 0), 1),
  };
}

/** Maps an imported MEE6 level to the new IRO+ curve without lowering rank. */
export function xpForMee6LevelMigration(mee6Level: number): number {
  return totalXpForLevel(Math.max(0, Math.floor(mee6Level)));
}
