import { describe, expect, it } from "vitest";
import { mergeSentChatPreview, sentChatPreview } from "../lib/chat-list-preview";
import type { ChatRoom } from "../constants/mock-data";

const room: ChatRoom = {
  id: "event_chat_event-1", name: "イベント", type: "event", sourceId: "event-1",
  participants: ["member-1"], createdBy: "member-1", shared: true,
};

describe("chat list preview after sending", () => {
  it("shows the sent message even when the refreshed room summary is still empty", () => {
    const sent = sentChatPreview({ id: "message-1", content: "参加します", createdAt: "2026-09-19T08:13:00Z" });
    expect(mergeSentChatPreview(room, sent)).toMatchObject({ lastMessage: "参加します", lastMessageAt: sent.createdAt });
    expect(mergeSentChatPreview({ ...room, lastMessage: "", lastMessageAt: sent.createdAt }, sent).lastMessage).toBe("参加します");
  });

  it("uses a newer server message when the room list catches up", () => {
    const sent = sentChatPreview({ id: "message-1", content: "参加します", createdAt: "2026-09-19T08:13:00Z" });
    const updated = { ...room, lastMessage: "了解です", lastMessageAt: "2026-09-19T08:14:00Z" };
    expect(mergeSentChatPreview(updated, sent)).toBe(updated);
  });

  it("shows a media placeholder when the message has no text", () => {
    expect(sentChatPreview({ id: "message-2", content: "", createdAt: "2026-09-19T08:13:00Z", attachmentUrls: ["image.jpg"] }).text).toBe("画像が送信されました");
  });
});
