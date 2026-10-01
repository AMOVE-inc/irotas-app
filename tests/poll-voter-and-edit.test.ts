import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { canSelectPollOption, viewerHasPollVote } from "../lib/poll-voting";

const chat = readFileSync("app/chat/index.tsx", "utf8");
const board = readFileSync("app/(tabs)/board.tsx", "utf8");

describe("poll voter visibility and edit gate", () => {
  it("requires edit mode after the viewer has voted", () => {
    expect(viewerHasPollVote([["m1"], ["m2"]], "m1")).toBe(true);
    expect(viewerHasPollVote([["m1"], ["m2"]], "m3")).toBe(false);
    expect(canSelectPollOption(false, false)).toBe(true);
    expect(canSelectPollOption(true, false)).toBe(false);
    expect(canSelectPollOption(true, true)).toBe(true);
    expect(canSelectPollOption(true, true, true)).toBe(false);
  });

  it.each([
    ["chat", chat],
    ["board", board],
  ])("shows voter details and explicit vote editing in %s polls", (_surface, source) => {
    expect(source).toContain("投票者を見る");
    expect(source).toContain("投票を編集");
    expect(source).toContain("投票編集を完了");
    expect(source).toContain("に投票した人");
    expect(source).toContain("canSelectPollOption");
  });

  it("passes single or multiple choice metadata from chat options to the reaction handler", () => {
    expect(chat).toContain("onVote(voteKey, choices, allowMultiple)");
    expect(chat).toContain("handleReaction(item.id, emoji, pollChoices, allowMultiple)");
  });
});
