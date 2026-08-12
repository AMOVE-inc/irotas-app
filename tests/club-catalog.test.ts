import { describe, expect, it } from "vitest";
import { CLUBS, CURRENT_USER } from "../constants/mock-data";

describe("club catalog and approval flow", () => {
  it("uses the requested twelve clubs without Discord mention identifiers", () => {
    expect(CLUBS.map((club) => club.name)).toEqual([
      "ディズニー部", "散歩部", "旅行部", "スポーツ観戦部", "ワイン部", "パン部",
      "スイーツ部", "料理教室部", "昼飲み部", "舞台鑑賞部", "ランニング部", "スポーツ部",
    ]);
    expect(JSON.stringify(CLUBS)).not.toMatch(/<@\d+>/);
  });

  it("keeps leaders as approved members and supports joined-first ordering", () => {
    CLUBS.forEach((club) => expect(club.memberIds).toContain(club.leaderId));
    const sorted = [...CLUBS].sort((a, b) => Number(b.memberIds.includes(CURRENT_USER.id)) - Number(a.memberIds.includes(CURRENT_USER.id)));
    const firstUnjoined = sorted.findIndex((club) => !club.memberIds.includes(CURRENT_USER.id));
    expect(sorted.slice(0, firstUnjoined).every((club) => club.memberIds.includes(CURRENT_USER.id))).toBe(true);
  });
});
