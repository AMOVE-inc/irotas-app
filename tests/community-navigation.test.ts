import { describe, expect, it } from "vitest";
import { boardRouteRequests, boardThreadHref, chatRoomHref, chatRoomRoute, clubBoardHref, clubBoardRoute, introductionChatHref, introductionChatRoute } from "../lib/community-navigation";

describe("community navigation", () => {
  it("opens the exact free-chat and meal-report posts from the timeline", () => {
    expect(boardThreadHref({ category: "free-chat", threadId: "new-thread", fromHome: true }))
      .toBe("/(tabs)/board?category=free-chat&view=threads&thread=new-thread&fromHome=1");
    expect(boardThreadHref({ category: "meal-report", threadId: "new-report", fromHome: true }))
      .toBe("/(tabs)/board?category=meal-report&view=threads&thread=new-report&fromHome=1");
  });

  it("loads the current category list before resolving an exact timeline post", () => {
    expect(boardRouteRequests("free-chat", "new-thread")).toEqual([
      { category: "free-chat", limit: 200 },
      { category: "free-chat", threadId: "new-thread" },
    ]);
  });

  it("opens joined clubs without duplicating or dropping the club prefix", () => {
    expect(clubBoardHref("club-golf")).toBe("/(tabs)/board?category=club-club-golf&view=threads");
    expect(clubBoardHref("golf")).toBe("/(tabs)/board?category=club-club-golf&view=threads");
    expect(clubBoardRoute("club-golf")).toEqual({ pathname: "/(tabs)/board", params: { category: "club-club-golf", view: "threads" } });
  });

  it("keeps all room context in an explicit chat URL", () => {
    expect(chatRoomHref({ id: "room 1", name: "運営 アナウンス", type: "board", sourceId: "announcement", participants: ["a", "b"], unreadCount: 2 }))
      .toBe("/chat?id=room+1&unreadCount=2&roomName=%E9%81%8B%E5%96%B6+%E3%82%A2%E3%83%8A%E3%82%A6%E3%83%B3%E3%82%B9&roomType=board&sourceId=announcement&participants=a%2Cb");
    expect(chatRoomRoute({ id: "room 1", name: "運営 アナウンス", type: "board", sourceId: "announcement", participants: ["a", "b"], unreadCount: 2 })).toEqual({ pathname: "/chat", params: { id: "room 1", unreadCount: "2", roomName: "運営 アナウンス", roomType: "board", sourceId: "announcement", participants: "a,b" } });
    expect(introductionChatRoute()).toMatchObject({ pathname: "/chat", params: { id: "board-introduction", roomName: "自己紹介" } });
    expect(introductionChatHref()).toBe("/chat?id=board-introduction&unreadCount=0&roomName=%E8%87%AA%E5%B7%B1%E7%B4%B9%E4%BB%8B&roomType=board&sourceId=introduction");
  });
});
