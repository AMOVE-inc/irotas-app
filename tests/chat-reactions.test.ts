import { describe, expect, it } from "vitest";
import { toggleReactionMember } from "../lib/chat-reactions";
import { normalizeBoardReactions } from "../lib/board-reactions";

describe("chat emoji reactions", () => {
  it("adds and removes a member reaction without changing the source", () => {
    const source = { "👍": ["u2"] };
    const added = toggleReactionMember(source, "👍", "u1");
    expect(added).toEqual({ "👍": ["u2", "u1"] });
    expect(source).toEqual({ "👍": ["u2"] });
    expect(toggleReactionMember(added, "👍", "u1")).toEqual({ "👍": ["u2"] });
  });

  it("removes an empty emoji bucket", () => {
    expect(toggleReactionMember({ "❤️": ["u1"] }, "❤️", "u1")).toEqual({});
  });

  it("Discordのカスタム絵文字コードを通常の絵文字へ統合する", () => {
    expect(normalizeBoardReactions({ "<:emoji_3:1458869416589529220>": ["u1"], "😊": ["u2"] })).toEqual({ "😊": ["u1", "u2"] });
  });
});
