import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("native UI regressions", () => {
  it("uses the bottom action sheet for board thread long presses on every platform", () => {
    const board = source("app/(tabs)/board.tsx");
    const handler = board.slice(board.indexOf("const openThreadActions"), board.indexOf("return <>", board.indexOf("const openThreadActions")));
    expect(handler).toContain("setShowActions(true)");
    expect(handler).not.toContain("Alert.alert");
  });

  it("shows Google Places photos in gourmet-map list cards", () => {
    const map = source("app/gourmet-map.tsx");
    expect(map).toContain('<RestaurantPhoto restaurant={restaurant} allowGooglePhoto style={{ width: 100, height: 100 }} />');
  });

  it("keeps the board compose button above the safe-area tab bar", () => {
    const board = source("app/(tabs)/board.tsx");
    expect(board).toContain("bottom: 104 + insets.bottom");
  });

  it("removes legacy rank suffixes and renders the shared badge in club rosters", () => {
    const board = source("app/(tabs)/board.tsx");
    expect(board).toContain("const cleanName = stripRankFromName(name)");
    expect(board).toContain('<MemberRankBadge rank={rank} name={name} role={role} compact />');
  });
});
