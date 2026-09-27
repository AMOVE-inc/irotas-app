import { describe, expect, it } from "vitest";
import { isValidPollVote } from "../sites/chat-content";

describe("chat poll vote validation", () => {
  const content = "📊 **次回の会場はどこがよいですか？**\n◯ とても長い日本語の選択肢でも投票できる会場名\n◯ 渋谷\n期限: 2026-10-31\n複数回答: 不可";

  it("accepts an exact long choice", () => {
    expect(isValidPollVote(content, "🗳️とても長い日本語の選択肢でも投票できる会場名")).toBe(true);
  });

  it("rejects a forged choice and a reaction on a normal message", () => {
    expect(isValidPollVote(content, "🗳️存在しない会場")).toBe(false);
    expect(isValidPollVote("通常メッセージ", "🗳️渋谷")).toBe(false);
  });
});
