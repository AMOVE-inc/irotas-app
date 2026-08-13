import { describe, expect, it } from "vitest";
import { getLevelFromXp } from "../lib/xp-store";

describe("XP level", () => {
  it("50 XPごとにレベルが上がる", () => {
    expect(getLevelFromXp(0)).toBe(1);
    expect(getLevelFromXp(49)).toBe(1);
    expect(getLevelFromXp(50)).toBe(2);
    expect(getLevelFromXp(620)).toBe(13);
  });
});
