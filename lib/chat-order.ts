import type { ChatRoom } from "../constants/mock-data";

/** 更新の新しいチャットを先頭に並べる。 */
export function sortRoomsByRecent(rooms: ChatRoom[]): ChatRoom[] {
  return [...rooms].sort((a, b) => {
    const aTime = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const bTime = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return bTime - aTime;
  });
}
