import { describe, expect, it } from "vitest";
import { BOARD_CATEGORIES, CHAT_ROOMS, CLUBS, CURRENT_USER } from "../constants/mock-data";

describe("board category ordering", () => {
  it("orders the four general categories from top to bottom", () => {
    expect(BOARD_CATEGORIES.filter((category) => category.group === "all").map((category) => category.label)).toEqual([
      "自己紹介",
      "今日のごちそうさま報告",
      "教えてグルメ相談室",
      "なんでも掲示板",
    ]);
  });

  it("provides a structured self-introduction thread template", () => {
    const introduction = BOARD_CATEGORIES.find((category) => category.key === "introduction");
    expect(introduction?.label).toBe("自己紹介");
  });

  it("puts the monthly report before clubs the member has joined", () => {
    const clubCategories = BOARD_CATEGORIES.filter((category) => category.group === "club");
    expect(clubCategories[0].label).toBe("今月の部活動レポート");
    const joinedClubNames = CLUBS.filter((club) => club.memberIds.includes(CURRENT_USER.id)).map((club) => club.name);
    const visibleLabels = clubCategories.slice(1).filter((category) => joinedClubNames.includes(category.label)).map((category) => category.label);
    expect(visibleLabels).toEqual(joinedClubNames);
  });

  it("keeps announcements only in chat and the general board out of chat", () => {
    expect(CHAT_ROOMS.find((room) => room.id === "board-announcement")?.sourceId).toBe("announcement");
    expect(BOARD_CATEGORIES.some((category) => category.key === "announcement")).toBe(false);
    expect(CHAT_ROOMS.some((room) => room.id === "board-free-chat")).toBe(false);
  });
});
