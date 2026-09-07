import { describe, expect, it } from "vitest";
import { formatClubLeaderName, formatClubName } from "../lib/club-display";

describe("club display formatting", () => {
  it("keeps the catalog club name while normalizing whitespace", () => {
    expect(formatClubName("  ゴルフ部  ")).toBe("ゴルフ部");
  });

  it("removes role suffixes from a leader name because the UI renders a separate badge", () => {
    expect(formatClubLeaderName("まりこ⛳ゴルフ部長")).toBe("まりこ");
    expect(formatClubLeaderName("723【運営】")).toBe("723");
  });

  it("uses a safe placeholder for an absent leader name", () => {
    expect(formatClubLeaderName(undefined)).toBe("未設定");
  });
});
