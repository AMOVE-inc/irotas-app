import { describe, expect, it } from "vitest";
import type { SharedBoardComment, SharedBoardThread } from "../lib/_core/api";
import { boardCommentData, boardThreadData, mergeSharedBoardThreads, sharedCommentToBoardComment, sharedThreadToBoardThread } from "../lib/shared-board-content";
import { CURRENT_USER, type BoardThread } from "../constants/mock-data";
import { chunkBoardContentIds } from "../sites/board-content";

describe("shared board content mapping", () => {
  it("restores a shared thread and preserves the viewer reaction", () => {
    const record: SharedBoardThread = { id: "shared-1", authorId: "IRO0099", authorName: "共有会員", category: "meal-report", title: "お店", content: "感想", status: "none", pinned: false, data: { mealReport: { restaurantName: "お店", prefecture: "東京", rating: 5 } }, createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", reactions: { "❤️": { count: 3, reacted: true } } };
    const thread = sharedThreadToBoardThread(record, "IRO0001");
    expect(thread.shared).toBe(true);
    expect(thread.mealReport?.rating).toBe(5);
    expect(thread.reactions?.["❤️"]).toHaveLength(3);
    expect(thread.reactions?.["❤️"]).toContain("IRO0001");
  });

  it("does not persist device-local image URIs", () => {
    const thread = { id: "local", title: "投稿", author: CURRENT_USER, category: "free-chat", commentCount: 0, lastUpdated: "", preview: "本文", isRecruiting: false, images: ["blob:local", "file:///photo.jpg", "https://example.com/photo.jpg", "/api/event-images/events/1/photo.jpg"], videos: ["blob:local", "/api/event-images/events%2F1%2Fclip.mp4"] } satisfies BoardThread;
    expect(boardThreadData(thread).images).toEqual(["https://example.com/photo.jpg", "/api/event-images/events/1/photo.jpg"]);
    expect(boardThreadData(thread).videos).toEqual(["/api/event-images/events%2F1%2Fclip.mp4"]);
  });

  it("round-trips shared comment metadata", () => {
    const record: SharedBoardComment = { id: "comment-1", threadId: "shared-1", authorId: "IRO0099", authorName: "共有会員", content: "コメント", data: { poll: { question: "どちら？", deadline: "2026-09-01", options: [], allowMultiple: false }, replyTo: { id: "comment-original", authorName: "元の会員", excerpt: "元のコメント" } }, createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", reactions: {} };
    const comment = sharedCommentToBoardComment(record, "IRO0001");
    expect(comment.shared).toBe(true);
    expect(comment.poll?.question).toBe("どちら？");
    expect(boardCommentData(comment).poll).toEqual(comment.poll);
    expect(boardCommentData(comment).replyTo).toEqual(record.data.replyTo);
  });

  it("keeps reacting member IDs for the reaction details sheet", () => {
    const record: SharedBoardComment = { id: "comment-2", threadId: "shared-1", authorId: "IRO0099", authorName: "共有会員", content: "コメント", data: {}, createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", reactions: { "🎉": { count: 2, reacted: true, memberIds: ["IRO0001", "IRO0002"] } } };
    expect(sharedCommentToBoardComment(record, "IRO0001").reactions?.["🎉"]).toEqual(["IRO0001", "IRO0002"]);
  });

  it("keeps category-loaded posts when the capped all-category request finishes later", () => {
    const recentFreeChat = { id: "recent-free-chat", title: "最近の投稿", author: CURRENT_USER, category: "free-chat", commentCount: 0, lastUpdated: "2026-09-22T00:00:00Z", preview: "本文", isRecruiting: false, shared: true } satisfies BoardThread;
    const globalPageThread = { ...recentFreeChat, id: "global-page-thread", category: "meal-report" } satisfies BoardThread;

    expect(mergeSharedBoardThreads([recentFreeChat], [globalPageThread]).map((thread) => thread.id)).toEqual([
      "global-page-thread",
      "recent-free-chat",
    ]);
  });

  it("still treats a category-specific response as authoritative for that category", () => {
    const staleFreeChat = { id: "stale-free-chat", title: "削除済み", author: CURRENT_USER, category: "free-chat", commentCount: 0, lastUpdated: "2026-09-01T00:00:00Z", preview: "本文", isRecruiting: false, shared: true } satisfies BoardThread;
    const mealReport = { ...staleFreeChat, id: "meal-report", category: "meal-report" } satisfies BoardThread;

    expect(mergeSharedBoardThreads([staleFreeChat, mealReport], [], { category: "free-chat" }).map((thread) => thread.id)).toEqual([
      "meal-report",
    ]);
  });

  it("batches a large category below the D1 reaction-query parameter limit", () => {
    const batches = chunkBoardContentIds(Array.from({ length: 98 }, (_, index) => `thread-${index}`));

    expect(batches.map((batch) => batch.length)).toEqual([40, 40, 18]);
    expect(Math.max(...batches.map((batch) => batch.length * 2))).toBeLessThanOrEqual(80);
  });
});
