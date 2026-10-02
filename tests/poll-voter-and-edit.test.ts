import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { canSelectPollOption, canSubmitPollSelection, nextPollSelection, viewerHasPollVote } from "../lib/poll-voting";

const chat = readFileSync("app/chat/index.tsx", "utf8");
const board = readFileSync("app/(tabs)/board.tsx", "utf8");
const pollResultTabs = readFileSync("components/poll-result-tabs.tsx", "utf8");

describe("poll voter visibility and edit gate", () => {
  it("requires edit mode after the viewer has voted", () => {
    expect(viewerHasPollVote([["m1"], ["m2"]], "m1")).toBe(true);
    expect(viewerHasPollVote([["m1"], ["m2"]], "m3")).toBe(false);
    expect(canSelectPollOption(false, false)).toBe(true);
    expect(canSelectPollOption(true, false)).toBe(false);
    expect(canSelectPollOption(true, true)).toBe(true);
    expect(canSelectPollOption(true, true, true)).toBe(false);
  });

  it("allows an edited vote to be saved with no selected options", () => {
    expect(nextPollSelection(["one"], "one", false)).toEqual([]);
    expect(nextPollSelection(["one", "two"], "one", true)).toEqual(["two"]);
    expect(canSubmitPollSelection(0, false)).toBe(false);
    expect(canSubmitPollSelection(0, true)).toBe(true);
  });

  it.each([
    ["chat", chat],
    ["board", board],
  ])("shows voter details and explicit vote editing in %s polls", (_surface, source) => {
    expect(source).not.toContain("投票者を見る");
    expect(source).toContain("結果を表示");
    expect(source).toContain('editingVote ? "保存" : "投票"');
    expect(source).toContain("投票を編集");
    expect(source).toContain("投票結果");
    expect(source).toContain("canSelectPollOption");
  });

  it("passes single or multiple choice metadata from chat options to the reaction handler", () => {
    expect(chat).toContain("await onVote(`🗳️${choice}`, choices, allowMultiple)");
    expect(chat).toContain("handleReaction(item.id, emoji, pollChoices, allowMultiple)");
  });

  it("keeps poll result choices in one horizontally scrollable row", () => {
    expect(pollResultTabs).toContain("<ScrollView");
    expect(pollResultTabs).toContain("horizontal");
    expect(pollResultTabs).toContain("showsHorizontalScrollIndicator={false}");
    expect(pollResultTabs).not.toContain('flexWrap: "wrap"');
    expect(pollResultTabs).toContain("numberOfLines={1}");
  });
});
