import { describe, expect, it } from "vitest";
import { filterBoardArchive } from "../sites/board-archive";
import type { RawDiscordBoardArchive } from "../lib/discord-board-import";

const fixture: RawDiscordBoardArchive = {
  threads: [
    { id: "public", authorId: "1", authorName: "公開", content: "公開本文", createdAt: "2026-01-01", images: [], videos: [], category: "club-all", title: "活動報告" },
    { id: "bread", authorId: "2", authorName: "パン", content: "パン部限定", createdAt: "2026-01-02", images: [], videos: [], category: "club-club-bread", title: "パン部" },
    { id: "wine", authorId: "3", authorName: "ワイン", content: "ワイン部限定", createdAt: "2026-01-03", images: [], videos: [], category: "club-club-wine", title: "ワイン部" },
  ],
  comments: [
    { id: "c1", threadId: "public", authorId: "1", authorName: "公開", content: "公開コメント", createdAt: "2026-01-01", images: [], videos: [] },
    { id: "c2", threadId: "bread", authorId: "2", authorName: "パン", content: "パン部コメント", createdAt: "2026-01-02", images: [], videos: [] },
    { id: "c3", threadId: "wine", authorId: "3", authorName: "ワイン", content: "ワイン部コメント", createdAt: "2026-01-03", images: [], videos: [] },
  ],
};

describe("authenticated board archive filtering", () => {
  it("未入部ユーザーには部員専用スレとコメントを返さない", () => {
    const result = filterBoardArchive(fixture, new Set());
    expect(result.threads.map((thread) => thread.id)).toEqual(["public"]);
    expect(result.comments.map((comment) => comment.id)).toEqual(["c1"]);
  });

  it("入部済みの部活動だけを返す", () => {
    const result = filterBoardArchive(fixture, new Set(["club-club-bread"]));
    expect(result.threads.map((thread) => thread.id)).toEqual(["public", "bread"]);
    expect(result.comments.map((comment) => comment.id)).toEqual(["c1", "c2"]);
    expect(JSON.stringify(result)).not.toContain("ワイン部限定");
  });
});
