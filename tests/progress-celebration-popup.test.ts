import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync("app/_layout.tsx", "utf8");
const popup = readFileSync("components/xp-reward-popup.tsx", "utf8");

describe("progress celebration popup", () => {
  it("shows level and rank increases once after refreshed XP arrives", () => {
    expect(layout).toContain("irotas_seen_progress_v1:");
    expect(layout).toContain("nextLevel <= previousLevel && !rankUp");
    expect(layout).toContain("<ProgressCelebrationGate />");
    expect(popup).toContain('rankUp ? "ランクアップ！"');
    expect(popup).toContain('levelUp ? "レベルアップ！"');
  });
});
