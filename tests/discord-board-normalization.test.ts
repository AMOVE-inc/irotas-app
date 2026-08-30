import { describe, expect, it } from "vitest";
import { cleanDiscordBoardContent, cleanDiscordBoardTitle } from "../lib/discord-board-normalization";

describe("Discord board normalization", () => {
  it("removes recruitment status from a migrated title", () => {
    expect(cleanDiscordBoardTitle("【募集中】 マーダーミステリー会")).toBe("マーダーミステリー会");
  });

  it("removes a duplicated free-chat title from the body", () => {
    expect(cleanDiscordBoardContent("【募集中】マーダーミステリー会", "【募集中】マーダーミステリー会", "free-chat")).toBe("");
  });

  it("keeps a distinct free-chat body", () => {
    expect(cleanDiscordBoardContent("募集", "詳しい募集内容です", "free-chat")).toBe("詳しい募集内容です");
  });
});
