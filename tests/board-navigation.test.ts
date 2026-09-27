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

  it("waits for the club catalog before validating a direct club-board route", () => {
    const boardScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/board.tsx"), "utf8");
    const waitForCatalog = boardScreen.indexOf('clubStoreStatus === "idle" || clubStoreStatus === "loading"');
    const fallbackRedirect = boardScreen.indexOf('router.replace("/(tabs)/board")', waitForCatalog);
    expect(boardScreen).toContain("useClubStoreStatus");
    expect(waitForCatalog).toBeGreaterThan(-1);
    expect(fallbackRedirect).toBeGreaterThan(waitForCatalog);
    expect(boardScreen).not.toContain('clubStoreStatus === "loaded" && !canAccessCategory(selectedCategory)');
    expect(boardScreen).toContain('if (!selectedCategory)');
    expect(boardScreen).toContain('category.group !== "club" || userCanViewAllClubContent');
  });

  it("does not paint an archive snapshot while a current category is loading", () => {
    const boardScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/board.tsx"), "utf8");
    expect(boardScreen).toContain("isThreadView && (archiveLoading || sharedLoading || categoryLoading || waitingForClubCatalog)");
    expect(boardScreen).toContain("router.push(introductionChatRoute() as any)");
  });

  it("opens joined clubs and activity reports through structured native routes", () => {
    const clubsScreen = readFileSync(resolve(process.cwd(), "app/clubs.tsx"), "utf8");
    const profileScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/profile.tsx"), "utf8");
    expect(clubsScreen).toContain("router.navigate(clubBoardRoute(club.id) as any)");
    expect(clubsScreen).toContain('router.navigate(boardThreadRoute({ category: "club-all", threadId: report.id }) as any)');
    expect(profileScreen).toContain("router.navigate(clubBoardRoute(club.id, true) as any)");
  });

  it("opens self introductions and chat-list rooms through structured native routes", () => {
    const boardScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/board.tsx"), "utf8");
    const chatListScreen = readFileSync(resolve(process.cwd(), "components/chat-list-screen.tsx"), "utf8");
    expect(boardScreen).toContain("router.push(introductionChatRoute() as any)");
    expect(boardScreen).toContain("router.replace(introductionChatRoute() as any)");
    expect(chatListScreen).toContain("router.push(chatRoomRoute({ ...room, unreadCount }) as any)");
    expect(chatListScreen).toContain("router.push(chatRoomRoute(room) as any)");
    expect(boardScreen).not.toContain("withAnchor");
    expect(chatListScreen).not.toContain("withAnchor");
    expect(readFileSync(resolve(process.cwd(), "app/chat/[id].tsx"), "utf8")).toContain('export { default } from "./index"');
  });

  it("does not overwrite a parameterized board navigation on tab selection", () => {
    const tabLayout = readFileSync(resolve(process.cwd(), "app/(tabs)/_layout.tsx"), "utf8");
    expect(tabLayout).not.toContain("listeners={{ tabPress:");
    expect(tabLayout).not.toContain('router.replace("/board")');
  });

  it("does not serialize community navigation into query-string hrefs", () => {
    const navigation = readFileSync(resolve(process.cwd(), "lib/community-navigation.ts"), "utf8");
    const productionCallers = [
      "app/(tabs)/board.tsx",
      "app/(tabs)/index.tsx",
      "app/(tabs)/profile.tsx",
      "app/clubs.tsx",
      "components/chat-list-screen.tsx",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
    expect(navigation).not.toContain("URLSearchParams");
    expect(navigation).not.toContain("Href(");
    expect(productionCallers).not.toMatch(/(?:boardThread|clubBoard|chatRoom|introductionChat)Href/);
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
    const chatScreen = readFileSync(resolve(process.cwd(), "app/chat/index.tsx"), "utf8");
    expect(boardScreen).toContain("initialUnreadCommentIds");
    expect(boardScreen).toContain("ここから未読コメント");
    expect(boardScreen).not.toContain(">ここから未読</Text>");
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
    expect(boardScreen).toContain('returnToTimeline={false}');
    expect(boardScreen).toContain('leavingThreadDetailRef.current = true;');
    expect(boardScreen).toContain('if (!threadParam || leavingThreadDetailRef.current) return;');
    expect(boardScreen).toContain('boardRouteRequests(requestCategory, threadParam)');
    expect(boardScreen).toContain('await loadSharedBoardContent(watchedCategory, undefined, watchedCategory ? 200 : 40)');
    expect(boardScreen).toContain('onClose={() => {');
    expect(boardScreen).toContain('leaveThreadDetail(fromHome === "1" ? () => router.replace("/(tabs)" as any) : undefined);');
    expect(boardScreen).toContain('leaveThreadDetail(() => router.push({ pathname: "/member-profile", params }))');
    expect(profileScreen).toContain('returnToBoardThread === "1" && boardCategory && boardThreadId');
    expect(profileScreen).toContain('thread: boardThreadId');
    expect(profileScreen).toContain('returnToTimeline === "1" ? { fromHome: "1" }');
  });

  it("manages board threads with open and close actions instead of a recruiting toggle", () => {
    const boardScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/board.tsx"), "utf8");
    expect(boardScreen).toContain('"投稿をクローズする"');
    expect(boardScreen).toContain('"投稿を固定する"');
    expect(boardScreen).toContain('"投稿の固定を解除する"');
    expect(boardScreen).toContain("📌 固定");
    expect(boardScreen).toContain('"投稿をオープンにする"');
    expect(boardScreen).toContain("クローズ済みの投稿");
    expect(boardScreen).not.toContain("募集中ステータス");
  });
});
