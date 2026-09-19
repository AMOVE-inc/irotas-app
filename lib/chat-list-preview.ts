import type { ChatMessage, ChatRoom } from "../constants/mock-data";

export type SentChatPreview = {
  messageId: string;
  text: string;
  createdAt: string;
};

export function sentChatPreview(message: Pick<ChatMessage, "id" | "content" | "createdAt" | "imageUri" | "attachmentUrls">): SentChatPreview {
  return {
    messageId: message.id,
    text: message.content || (message.imageUri || message.attachmentUrls?.length ? "画像が送信されました" : ""),
    createdAt: message.createdAt,
  };
}

/** Keep a just-sent message visible while a room-list read catches up. */
export function mergeSentChatPreview(room: ChatRoom, preview: SentChatPreview): ChatRoom {
  const serverTime = room.lastMessageAt ? Date.parse(room.lastMessageAt) : NaN;
  const sentTime = Date.parse(preview.createdAt);
  if (room.lastMessage && Number.isFinite(serverTime) && Number.isFinite(sentTime) && serverTime >= sentTime) return room;
  return { ...room, lastMessage: preview.text, lastMessageAt: preview.createdAt };
}
