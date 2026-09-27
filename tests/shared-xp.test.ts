import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rankFromXp } from "../sites/xp";
import { getNextLevelInfo, levelFromXp, minimumXpForRank, totalXpForLevel, xpForMee6LevelMigration } from "../lib/xp-levels";

describe("shared XP", () => {
  it("uses the agreed level curve and rank thresholds", () => {
    expect(rankFromXp(0)).toBe("regular");
    expect(totalXpForLevel(5)).toBe(1500);
    expect(totalXpForLevel(10)).toBe(5500);
    expect(totalXpForLevel(15)).toBe(12000);
    expect(levelFromXp(1499)).toBe(4);
    expect(rankFromXp(1500)).toBe("silver");
    expect(rankFromXp(5500)).toBe("gold");
    expect(rankFromXp(12000)).toBe("platinum");
    expect(getNextLevelInfo(1500)).toMatchObject({ currentLevel: 5, nextLevel: 6, pointsNeeded: 600 });
    expect(xpForMee6LevelMigration(10)).toBe(5500);
    expect(minimumXpForRank("gold")).toBe(5500);
    expect(minimumXpForRank("platinum")).toBe(12000);
  });

  it("persists idempotent XP operations in schema 18", () => {
    const migration = fs.readFileSync(path.join(process.cwd(), "drizzle/0017_shared_xp.sql"), "utf8");
    expect(migration).toContain("UNIQUE(member_id, action, source_id)");
    expect(migration).toContain("platform_schema_version");
    expect(migration).toContain("'18'");
  });

  it("awards chat XP only for eligible messages and caps daily rewards", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "sites/xp.ts"), "utf8");
    expect(source).toContain('chat_message: { amount: 10');
    expect(source).toContain('value.length >= 10');
    expect(source).toContain('xpContentEligible');
    expect(source).toContain('Number(daily?.count ?? 0) >= 5');
  });

  it("awards 20 XP to a completed event host and can reverse it on cancellation", () => {
    const migration = fs.readFileSync(path.join(process.cwd(), "drizzle/0018_event_host_xp.sql"), "utf8");
    const hostXp = fs.readFileSync(path.join(process.cwd(), "sites/event-host-xp.ts"), "utf8");
    const events = fs.readFileSync(path.join(process.cwd(), "sites/events.ts"), "utf8");
    expect(migration).toContain("amount INTEGER NOT NULL DEFAULT 20");
    expect(migration).toContain("'reversed'");
    expect(migration).toContain("'19'");
    expect(hostXp).toContain("const HOST_REWARD = 20");
    expect(hostXp).toContain("reverseCancelledEventHostXp");
    expect(events).toContain("event.cancelled");
  });
});
