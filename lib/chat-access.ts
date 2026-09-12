import type { ChatRoom, MemberRank } from "@/constants/mock-data";

export function canAccessChatRoom(
  room: ChatRoom,
  memberId: string,
  memberRank: MemberRank,
  isAdmin = false,
): boolean {
  // 個人間DMは、運営・管理者を含め当事者以外には一切表示しない。
  if (room.type === "dm") return room.participants.includes(memberId);
  if (room.type === "club") return room.participants.includes(memberId);
  if (room.type === "rank") {
    return room.requiredRank === memberRank && (room.participants.length === 0 || room.participants.includes(memberId));
  }
  return isAdmin || room.participants.includes(memberId);
}
