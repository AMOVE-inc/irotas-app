import { describe, expect, it } from "vitest";
import { BOARD_THREADS, CHAT_ROOMS } from "../constants/mock-data";
import { parseInternalLink, splitInternalLinks } from "../lib/internal-links";

describe("internal link mentions", () => {
  it("links to an imported event without embedding its title in the client", () => {
    expect(parseInternalLink("https://app.irotas-community.com/event-detail?id=discord-event-123", CHAT_ROOMS, BOARD_THREADS)).toMatchObject({
      label: "📅 イベントを開く",
      pathname: "/event-detail",
      params: { id: "discord-event-123" },
    });
  });
  it("converts a chat URL into a named mention", () => {
    expect(parseInternalLink("https://app.irotas-community.com/chat?id=board-announcement", CHAT_ROOMS, BOARD_THREADS)).toMatchObject({
      label: "#運営アナウンス",
      pathname: "/chat",
      params: { id: "board-announcement" },
    });
  });

  it("converts a board thread URL into a named mention", () => {
    expect(parseInternalLink("https://app.irotas-community.com/board?category=gourmet-advice&view=threads&thread=t1", CHAT_ROOMS, BOARD_THREADS)).toMatchObject({
      label: "#渋谷でおすすめの焼肉屋さん教えてください！",
      pathname: "/board",
      params: { category: "gourmet-advice", view: "threads", thread: "t1" },
    });
  });

  it("converts copied board category links into named mentions", () => {
    expect(parseInternalLink("https://app.irotas-community.com/board?category=introduction&view=threads", CHAT_ROOMS, BOARD_THREADS)).toMatchObject({ label: "#自己紹介", pathname: "/board", params: { category: "introduction", view: "threads" } });
    expect(parseInternalLink("https://app.irotas-community.com/clubs", CHAT_ROOMS, BOARD_THREADS)).toMatchObject({ label: "#部活動", pathname: "/clubs", params: {} });
    expect(parseInternalLink("https://app.irotas-community.com/gourmet-map", CHAT_ROOMS, BOARD_THREADS)).toMatchObject({ label: "#グルメマップ", pathname: "/gourmet-map", params: {} });
  });

  it("keeps surrounding message text", () => {
    expect(splitInternalLinks("こちら https://app.irotas-community.com/chat?id=chat1 を確認")).toHaveLength(3);
  });
});
