import type { ChatRoom, MemberRank } from "@/constants/mock-data";

const RANK_ORDER = ["regular", "silver", "gold", "platinum"] as const;

export function canAccessRankRoom(memberRank: unknown, requiredRank: unknown): boolean {
  const memberIndex = RANK_ORDER.findIndex((rank) => rank === memberRank);
  const requiredIndex = RANK_ORDER.findIndex((rank) => rank === requiredRank);
  return memberIndex >= 0 && requiredIndex >= 0 && memberIndex >= requiredIndex;
}

export function canAccessChatRoom(
  room: ChatRoom,
  memberId: string,
  memberRank: MemberRank,
  canViewAllChats = false,
): boolean {
  if (canViewAllChats) return true;
  if (room.type === "dm") return room.participants.includes(memberId);
  if (room.type === "club") return room.participants.includes(memberId);
  if (room.id === "community-free-chat" || room.sourceId === "community-free-chat") return true;
  if (room.type === "rank") {
    return canAccessRankRoom(memberRank, room.requiredRank);
  }
  return room.participants.includes(memberId);
}
