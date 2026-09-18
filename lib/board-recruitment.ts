import type { BoardThread } from "@/constants/mock-data";

export type BoardRecruitmentStatus = "open" | "closed" | "none";

export function isRecruitmentBoardCategory(category: string): boolean {
  return category === "free-chat" || category.startsWith("club-club-");
}

export function isClubSelfIntroduction(thread: Pick<BoardThread, "category" | "title">): boolean {
  return thread.category.startsWith("club-club-") && /自己紹介/.test(thread.title);
}

export function isThreadPinned(thread: Pick<BoardThread, "category" | "title" | "isPinned">): boolean {
  return Boolean(thread.isPinned || isClubSelfIntroduction(thread));
}

export function inferImportedRecruitment(category: string, title: string, content: string): boolean {
  return inferImportedRecruitmentStatus(category, title, content) === "open";
}

export function inferImportedRecruitmentStatus(category: string, title: string, content: string): BoardRecruitmentStatus {
  if (!isRecruitmentBoardCategory(category)) return "none";
  const text = `${title}\n${content}`;
  if (/募集終了|受付終了|応募終了|締め切り|締切|開催終了|中止/.test(text)) return "closed";
  if (/募集中|参加者募集|メンバー募集|ゆる募|ゆるぼ|あと\s*\d+\s*名/.test(text)) return "open";
  return "none";
}

export function getBoardRecruitmentStatus(thread: Pick<BoardThread, "category" | "title" | "isRecruiting" | "recruitmentStatus">): BoardRecruitmentStatus {
  if (thread.recruitmentStatus) return thread.recruitmentStatus;
  if (isClubSelfIntroduction(thread)) return "none";
  return thread.isRecruiting ? "open" : "closed";
}

export function isBoardThreadClosed(thread: Pick<BoardThread, "category" | "title" | "isRecruiting" | "recruitmentStatus">): boolean {
  return isRecruitmentBoardCategory(thread.category) && getBoardRecruitmentStatus(thread) === "closed";
}

export function displayBoardThreadTitle(thread: Pick<BoardThread, "category" | "title" | "isRecruiting" | "recruitmentStatus">): string {
  return thread.title.trim();
}

export function sortRecruitmentThreads(threads: BoardThread[]): BoardThread[] {
  return [...threads].sort((left, right) => {
    if (isRecruitmentBoardCategory(left.category)) {
      const statusDifference = Number(isBoardThreadClosed(left)) - Number(isBoardThreadClosed(right));
      if (statusDifference) return statusDifference;
    }
    const pinnedDifference = Number(isThreadPinned(right)) - Number(isThreadPinned(left));
    if (pinnedDifference) return pinnedDifference;
    return Date.parse(right.lastUpdated) - Date.parse(left.lastUpdated);
  });
}
