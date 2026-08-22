import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BOARD_CATEGORIES, BOARD_HOME_ORDER, CHAT_ROOMS, CLUBS, CURRENT_USER } from "../constants/mock-data";

describe("board category ordering", () => {
  it("orders the general categories from top to bottom", () => {
    expect(BOARD_CATEGORIES.filter((category) => category.group === "all").map((category) => category.label)).toEqual([
      "自己紹介",
      "今日のごちそうさま報告",
      "グルメ選手権",
      "教えてグルメ相談室",
      "なんでも掲示板",
      "グルメマップ",
    ]);
  });

  it("places club activity directly below self-introductions on the board home", () => {
    const labels = BOARD_HOME_ORDER.map((key) => key === "club"
      ? "部活動"
      : BOARD_CATEGORIES.find((category) => category.key === key)?.label);
    expect(labels).toEqual([
      "自己紹介",
      "部活動",
      "今日のごちそうさま報告",
      "グルメ選手権",
      "教えてグルメ相談室",
      "なんでも掲示板",
      "グルメマップ",
    ]);
  });

  it("contains area conversations in the general board", () => {
    expect(BOARD_CATEGORIES.some((category) => category.group === "area")).toBe(false);
    expect(BOARD_CATEGORIES.find((category) => category.key === "gourmet-map")?.group).toBe("all");
  });

  it("provides a structured self-introduction thread template", () => {
    const introduction = BOARD_CATEGORIES.find((category) => category.key === "introduction");
    expect(introduction?.label).toBe("自己紹介");
  });

  it("separates shared club boards from joined clubs", () => {
    const clubCategories = BOARD_CATEGORIES.filter((category) => category.group === "club");
    expect(clubCategories.slice(0, 2).map((category) => category.label)).toEqual(["部活動紹介・入部申請", "活動報告"]);
    const joinedClubNames = CLUBS.filter((club) => club.memberIds.includes(CURRENT_USER.id)).map((club) => club.name);
    const visibleLabels = clubCategories.slice(2).filter((category) => joinedClubNames.includes(category.label)).map((category) => category.label);
    expect(visibleLabels).toEqual(joinedClubNames);
  });

  it("keeps announcements only in chat and the general board out of chat", () => {
    expect(CHAT_ROOMS.find((room) => room.id === "board-announcement")?.sourceId).toBe("announcement");
    expect(BOARD_CATEGORIES.some((category) => category.key === "announcement")).toBe(false);
    expect(CHAT_ROOMS.some((room) => room.id === "board-free-chat")).toBe(false);
  });

  it("opens the member-only board from the joined-club preview card", () => {
    const clubsScreen = readFileSync(resolve(process.cwd(), "app/clubs.tsx"), "utf8");
    expect(clubsScreen).toContain("previewAsMember");
    expect(clubsScreen).toContain("onPress={() => router.push");
    expect(clubsScreen).toContain("club-${joinedClubPreview.id}");
    expect(clubsScreen).toContain("view: \"threads\"");
  });
});
