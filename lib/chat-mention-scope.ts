import type { ChatRoom } from "../constants/mock-data";
import { canAccessRankRoom } from "./chat-access";

type DirectoryMember = { id: string; branches: readonly string[]; memberRank: string };

/** Members who can read a chat are the only people offered for an individual mention. */
export function chatMentionMemberIds(
  room: Pick<ChatRoom, "id" | "type" | "requiredRank">,
  participants: readonly string[],
  directory: readonly DirectoryMember[],
): string[] {
  if (room.id === "community-free-chat" || room.id === "board-introduction" || room.id === "board-announcement")
    return directory.map((member) => member.id);
  if (room.id === "branch-kanto-free" || room.id === "branch-kansai-free") {
    const branch = room.id === "branch-kanto-free" ? "kanto" : "kansai";
    return directory.filter((member) => member.branches.includes(branch)).map((member) => member.id);
  }
  if (room.type === "rank")
    return directory.filter((member) => canAccessRankRoom(member.memberRank, room.requiredRank)).map((member) => member.id);
  return [...participants];
}
