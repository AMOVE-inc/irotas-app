import type { ChatRoom } from "@/constants/mock-data";

function queryPath(pathname: string, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && String(value).length > 0) query.set(key, String(value));
  });
  return `${pathname}?${query.toString()}`;
}

export function boardThreadHref(input: { category: string; threadId?: string; fromHome?: boolean; fromProfile?: boolean }) {
  return queryPath("/(tabs)/board", {
    category: input.category,
    view: "threads",
    thread: input.threadId,
    fromHome: input.fromHome ? "1" : undefined,
    fromProfile: input.fromProfile ? "1" : undefined,
  });
}

export function clubBoardHref(clubId: string, fromProfile = false) {
  const normalizedClubId = clubId.startsWith("club-") ? clubId : `club-${clubId}`;
  return boardThreadHref({ category: `club-${normalizedClubId}`, fromProfile });
}

export function chatRoomHref(room: Pick<ChatRoom, "id" | "name" | "type" | "sourceId" | "participants" | "unreadCount">) {
  return queryPath("/chat", {
    id: room.id,
    unreadCount: Math.max(0, room.unreadCount ?? 0),
    roomName: room.name,
    roomType: room.type,
    sourceId: room.sourceId,
    participants: room.participants.join(","),
  });
}

export function boardRouteRequests(category: string, threadId?: string) {
  return [
    { category, limit: 200 },
    ...(threadId ? [{ category, threadId }] : []),
  ];
}
