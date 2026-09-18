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

  it("keeps the non-member preview informational while joined clubs open their member-only board", () => {
    const clubsScreen = readFileSync(resolve(process.cwd(), "app/clubs.tsx"), "utf8");
    expect(clubsScreen).toContain("previewAsMember");
    expect(clubsScreen).toContain('"入部後の表示イメージ"');
    expect(clubsScreen).toContain("club-${club.id}");
    expect(clubsScreen).toContain("view: \"threads\"");
  });

  it("returns from club boards and activity reports to the club list", () => {
    const boardScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/board.tsx"), "utf8");
    expect(boardScreen).toContain('isIndividualClubBoard || activeCategory === "club-all") router.replace("/clubs")');
    expect(boardScreen).toContain('"部活一覧へ戻る"');
  });

  it("returns from a managed club member profile to the same management screen", () => {
    const clubsScreen = readFileSync(resolve(process.cwd(), "app/clubs.tsx"), "utf8");
    const profileScreen = readFileSync(resolve(process.cwd(), "app/member-profile.tsx"), "utf8");
    expect(clubsScreen).toContain('returnToClubManagement: "1", clubId: club.id');
    expect(profileScreen).toContain('returnToClubManagement === "1" && clubId');
    expect(profileScreen).toContain('reviewApplications: "1"');
    expect(clubsScreen).toContain("openApplicantProfile");
    expect(clubsScreen).toContain("onOpenProfile();");
    expect(clubsScreen).toContain("requestAnimationFrame(() => router.push");
    expect(clubsScreen).toContain("profile.avatarUrl");
    expect(clubsScreen).toContain("joinedDate.getMonth() + 1");
  });

  it("opens chat messages and board comments at the first unread item", () => {
    const boardScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/board.tsx"), "utf8");
    const chatScreen = readFileSync(resolve(process.cwd(), "app/chat.tsx"), "utf8");
    expect(boardScreen).toContain("initialUnreadCommentIds");
    expect(boardScreen).toContain("ここから未読コメント");
    expect(boardScreen).toContain("commentScrollRef.current?.scrollTo");
    expect(chatScreen).toContain("initiallyPositionedChat");
    expect(chatScreen).toContain("ここから未読メッセージ");
    expect(chatScreen).toContain("effectiveUnreadCount > 0 ? 0.12 : 1");
    expect(chatScreen).toContain("introductionFirstUnreadIndex");
  });

  it("returns from a meal-report profile to the exact report", () => {
    const boardScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/board.tsx"), "utf8");
    const profileScreen = readFileSync(resolve(process.cwd(), "app/member-profile.tsx"), "utf8");
    expect(boardScreen).toContain('returnToBoardThread: "1", boardCategory: thread.category, boardThreadId: thread.id');
    expect(boardScreen).toContain('onOpenMemberProfile(profileParams(thread.author.id, thread.author.name))');
    expect(boardScreen).toContain('returnToTimeline={fromHome === "1"}');
    expect(boardScreen).toContain('leavingThreadDetailRef.current = true;');
    expect(boardScreen).toContain('if (!threadParam || leavingThreadDetailRef.current) return;');
    expect(boardScreen).toContain('leaveThreadDetail(fromHome === "1" ? () => router.replace("/" as any) : undefined)');
    expect(boardScreen).toContain('leaveThreadDetail(() => router.push({ pathname: "/member-profile", params }))');
    expect(profileScreen).toContain('returnToBoardThread === "1" && boardCategory && boardThreadId');
    expect(profileScreen).toContain('thread: boardThreadId');
    expect(profileScreen).toContain('returnToTimeline === "1" ? { fromHome: "1" }');
  });

  it("manages board threads with open and close actions instead of a recruiting toggle", () => {
    const boardScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/board.tsx"), "utf8");
    expect(boardScreen).toContain('"投稿をクローズする"');
    expect(boardScreen).toContain('"投稿をオープンにする"');
    expect(boardScreen).toContain("クローズ済みの投稿");
    expect(boardScreen).not.toContain("募集中ステータス");
  });
});
