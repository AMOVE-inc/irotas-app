import { describe, expect, it } from "vitest";
import { toggleReactionMember } from "../lib/chat-reactions";
import { boardReactionImageUrl, normalizeBoardReactions } from "../lib/board-reactions";

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

  it("Discordのカスタム絵文字コードと旧識別名を画像表示用に統合する", () => {
    expect(normalizeBoardReactions({ "<:emoji_6:1458869550471975023>": ["u1"], emoji_6: ["u2"] })).toEqual({
      "<:emoji_6:1458869550471975023>": ["u1", "u2"],
    });
    expect(boardReactionImageUrl("emoji_6")).toBe("https://cdn.discordapp.com/emojis/1458869550471975023.png?size=64&quality=lossless");
  });

  it("IDが不明な旧識別名を画面に露出しない", () => {
    expect(normalizeBoardReactions({ emoji_999: ["u1"] })).toEqual({ "😊": ["u1"] });
  });

  it("投稿者一覧がないDiscordリアクションも件数を保持する", () => {
    expect(normalizeBoardReactions({ "🐭": { count: 3, users: null } }, "comment-1")["🐭"]).toEqual([
      "discord-reaction-unresolved-comment-1-🐭-0",
      "discord-reaction-unresolved-comment-1-🐭-1",
      "discord-reaction-unresolved-comment-1-🐭-2",
    ]);
  });
});
