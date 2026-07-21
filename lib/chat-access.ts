import type { ChatRoom, MemberRank } from "@/constants/mock-data";

export function canAccessChatRoom(
  room: ChatRoom,
  memberId: string,
  memberRank: MemberRank,
  isAdmin = false,
): boolean {
  if (room.type === "rank") {
    return room.requiredRank === memberRank && room.participants.includes(memberId);
  }
  return isAdmin || room.participants.includes(memberId);
}
