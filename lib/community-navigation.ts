import type { ChatRoom } from "@/constants/mock-data";

export type AppRoute = {
  pathname: string;
  params: Record<string, string>;
};

type BoardRouteInput = {
  category: string;
  threadId?: string;
  fromHome?: boolean;
  fromProfile?: boolean;
};

/**
 * Native navigation must receive params separately from the pathname. Passing a
 * serialized query string to Expo Router can resolve the tab group itself and
 * leave the user on the home tab instead of opening the requested screen.
 */
export function boardThreadRoute(input: BoardRouteInput): AppRoute {
  return {
    // Navigate by the public URL. Expo Router owns the mapping from `/board`
    // to the board tab; coupling callers to the `(tabs)` implementation detail
    // can rebuild the tab navigator at its home route on native.
    pathname: "/board",
    params: {
      category: input.category,
      view: "threads",
      ...(input.threadId ? { thread: input.threadId } : {}),
      ...(input.fromHome ? { fromHome: "1" } : {}),
      ...(input.fromProfile ? { fromProfile: "1" } : {}),
    },
  };
}

export function clubBoardRoute(clubId: string, fromProfile = false): AppRoute {
  const normalizedClubId = clubId.startsWith("club-") ? clubId : `club-${clubId}`;
  return boardThreadRoute({ category: `club-${normalizedClubId}`, fromProfile });
}

export function chatRoomRoute(room: Pick<ChatRoom, "id" | "name" | "type" | "sourceId" | "participants" | "unreadCount">): AppRoute {
  return {
    // Make the room id part of the native route identity. Query-only room ids
    // can be lost when Expo Router rebuilds the root stack around `(tabs)`.
    pathname: "/chat/[id]",
    params: {
      id: room.id,
      unreadCount: String(Math.max(0, room.unreadCount ?? 0)),
      roomName: room.name,
      roomType: room.type,
      sourceId: room.sourceId,
      participants: room.participants.join(","),
    },
  };
}

export function introductionChatRoute(unreadCount = 0): AppRoute {
  return {
    pathname: "/chat/[id]",
    params: {
      id: "board-introduction",
      unreadCount: String(Math.max(0, unreadCount)),
      roomName: "自己紹介",
      roomType: "board",
      sourceId: "introduction",
      participants: "",
    },
  };
}

export function boardRouteRequests(category: string, threadId?: string) {
  return [
    { category, limit: 200 },
    ...(threadId ? [{ category, threadId }] : []),
  ];
}
