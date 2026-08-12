import { describe, expect, it } from "vitest";
import { BOARD_THREADS, CHAT_ROOMS } from "../constants/mock-data";
import { parseInternalLink, splitInternalLinks } from "../lib/internal-links";

describe("internal link mentions", () => {
  it("converts a chat URL into a named mention", () => {
    expect(parseInternalLink("https://irotas.example/chat?id=board-announcement", CHAT_ROOMS, BOARD_THREADS)).toMatchObject({
      label: "#運営アナウンス",
      pathname: "/chat",
      params: { id: "board-announcement" },
    });
  });

  it("converts a board thread URL into a named mention", () => {
    expect(parseInternalLink("https://irotas.example/board?category=gourmet-advice&view=threads&thread=t1", CHAT_ROOMS, BOARD_THREADS)).toMatchObject({
      label: "#渋谷でおすすめの焼肉屋さん教えてください！",
      pathname: "/board",
      params: { category: "gourmet-advice", view: "threads", thread: "t1" },
    });
  });

  it("keeps surrounding message text", () => {
    expect(splitInternalLinks("こちら https://irotas.example/chat?id=chat1 を確認")).toHaveLength(3);
  });
});
