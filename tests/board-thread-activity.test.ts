import { describe, expect, it } from "vitest";
import { boardThreadActivityDate } from "../lib/board-thread-activity";
import { parseDiscordBoardArchive } from "../lib/discord-board-import";

describe("board thread activity date", () => {
  const thread = { createdAt: "2026-09-01T12:00:00.000Z", lastUpdated: "2026-09-05T12:00:00.000Z" };

  it("shows post creation when there are no comments", () => {
    expect(boardThreadActivityDate(thread, [])).toBe(thread.createdAt);
  });

  it("shows the newest comment regardless of API ordering", () => {
    expect(boardThreadActivityDate(thread, [
      { createdAt: "2026-09-19T10:00:00.000Z" },
      { createdAt: "2026-09-08T10:00:00.000Z" },
    ])).toBe("2026-09-19T10:00:00.000Z");
  });

  it("uses the server's newest app comment even before the comments load", () => {
    const withAppComment = { ...thread, lastCommentAt: "2026-09-20T06:00:00.000Z" };
    expect(boardThreadActivityDate(withAppComment, [])).toBe(withAppComment.lastCommentAt);
    expect(boardThreadActivityDate(withAppComment, [{ createdAt: "2026-09-10T10:00:00.000Z" }])).toBe(withAppComment.lastCommentAt);
  });

  it("combines archived comments with the newest app comment for imported threads", () => {
    const archive = parseDiscordBoardArchive({
      threads: [{ id: "discord-board-1", authorId: "1", authorName: "投稿者", content: "本文", createdAt: "2026-09-01T00:00:00Z", lastActivityAt: "2026-09-20T06:00:00Z", images: [], videos: [], category: "free-chat", title: "投稿" }],
      comments: [{ id: "comment-1", threadId: "discord-board-1", authorId: "2", authorName: "コメント者", content: "旧コメント", createdAt: "2026-09-10T00:00:00Z", images: [], videos: [] }],
    });
    expect(archive.threads[0].lastCommentAt).toBe("2026-09-20T06:00:00Z");
    expect(boardThreadActivityDate(archive.threads[0], archive.comments["discord-board-1"])).toBe("2026-09-20T06:00:00Z");
  });
});
