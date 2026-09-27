import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EVENT_XP } from "../sites/event-rewards";
import { xpContentEligible } from "../sites/xp";
import { POINT_ACTIONS } from "../constants/mock-data";

describe("XP policy", () => {
  it("uses the approved rewards and completion-only event rewards", () => {
    expect(POINT_ACTIONS).toMatchObject({
      comment: { points: 5 }, chatMessage: { points: 10 }, boardPost: { points: 20 },
      mealReportPost: { points: 30 }, eventJoin: { points: 40 }, eventOrganize: { points: 100 },
    });
    expect(EVENT_XP).toMatchObject({ created: 0, attendance: 40, completedHost: 100, attendanceBonus4: 0, attendanceBonus8: 0, feedback: 0 });
  });

  it("rejects short and normalized duplicate content", () => {
    expect(xpContentEligible("短い", [])).toBe(false);
    expect(xpContentEligible("今日のおすすめを共有します", [" 今日の おすすめを共有します "])).toBe(false);
    expect(xpContentEligible("別のお店について詳しく共有します", ["今日のおすすめを共有します"])).toBe(true);
  });

  it("stores idempotent and reversible server-side operations", () => {
    const migration = readFileSync("drizzle/0063_xp_policy.sql", "utf8");
    expect(migration).toContain("UNIQUE(member_id, action, source_id)");
    expect(migration).toContain("'reversed'");
    expect(migration).toContain("'chat_message','comment'");
  });
});
