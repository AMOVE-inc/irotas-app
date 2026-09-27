import { describe, expect, it } from "vitest";
import { boardRouteRequests, boardThreadRoute, chatRoomRoute, clubBoardRoute, introductionChatRoute } from "../lib/community-navigation";

describe("community navigation", () => {
  it("opens the exact free-chat and meal-report posts from the timeline", () => {
    expect(boardThreadRoute({ category: "free-chat", threadId: "new-thread", fromHome: true })).toEqual({
      pathname: "/board",
      params: { category: "free-chat", view: "threads", thread: "new-thread", fromHome: "1" },
    });
    expect(boardThreadRoute({ category: "meal-report", threadId: "new-report", fromHome: true })).toEqual({
      pathname: "/board",
      params: { category: "meal-report", view: "threads", thread: "new-report", fromHome: "1" },
    });
  });

  it("loads the current category list before resolving an exact timeline post", () => {
    expect(boardRouteRequests("free-chat", "new-thread")).toEqual([
      { category: "free-chat", limit: 200 },
      { category: "free-chat", threadId: "new-thread" },
    ]);
  });

  it("opens joined clubs without duplicating or dropping the club prefix", () => {
    expect(clubBoardRoute("club-golf")).toEqual({ pathname: "/board", params: { category: "club-club-golf", view: "threads" } });
    expect(clubBoardRoute("golf")).toEqual({ pathname: "/board", params: { category: "club-club-golf", view: "threads" } });
  });

  it("keeps all room context in structured native route params", () => {
    expect(chatRoomRoute({ id: "room 1", name: "運営 アナウンス", type: "board", sourceId: "announcement", participants: ["a", "b"], unreadCount: 2 })).toEqual({ pathname: "/chat/[id]", params: { id: "room 1", unreadCount: "2", roomName: "運営 アナウンス", roomType: "board", sourceId: "announcement", participants: "a,b" } });
    expect(introductionChatRoute()).toEqual({ pathname: "/chat/[id]", params: { id: "board-introduction", unreadCount: "0", roomName: "自己紹介", roomType: "board", sourceId: "introduction", participants: "" } });
  });
});
