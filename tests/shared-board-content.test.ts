import { describe, expect, it } from "vitest";
import type { SharedBoardComment, SharedBoardThread } from "../lib/_core/api";
import { boardCommentData, boardThreadData, sharedCommentToBoardComment, sharedThreadToBoardThread } from "../lib/shared-board-content";
import { CURRENT_USER, type BoardThread } from "../constants/mock-data";

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
    const thread = { id: "local", title: "投稿", author: CURRENT_USER, category: "free-chat", commentCount: 0, lastUpdated: "", preview: "本文", isRecruiting: false, images: ["blob:local", "file:///photo.jpg", "https://example.com/photo.jpg", "/api/event-images/events/1/photo.jpg"] } satisfies BoardThread;
    expect(boardThreadData(thread).images).toEqual(["https://example.com/photo.jpg", "/api/event-images/events/1/photo.jpg"]);
  });

  it("round-trips shared comment metadata", () => {
    const record: SharedBoardComment = { id: "comment-1", threadId: "shared-1", authorId: "IRO0099", authorName: "共有会員", content: "コメント", data: { poll: { question: "どちら？", deadline: "2026-09-01", options: [], allowMultiple: false } }, createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", reactions: {} };
    const comment = sharedCommentToBoardComment(record, "IRO0001");
    expect(comment.shared).toBe(true);
    expect(comment.poll?.question).toBe("どちら？");
    expect(boardCommentData(comment).poll).toEqual(comment.poll);
  });
});
