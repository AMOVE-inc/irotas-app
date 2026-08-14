import type { BoardThread } from "@/constants/mock-data";

export function isRecruitmentBoardCategory(category: string): boolean {
  return category === "free-chat" || category.startsWith("club-club-");
}

export function inferImportedRecruitment(category: string, title: string, content: string): boolean {
  if (!isRecruitmentBoardCategory(category)) return false;
  const text = `${title}\n${content}`;
  if (/募集終了|受付終了|応募終了|締め切り|締切|開催終了|中止/.test(text)) return false;
  return /募集中|参加者募集|メンバー募集|ゆる募|ゆるぼ|あと\s*\d+\s*名/.test(text);
}

export function sortRecruitmentThreads(threads: BoardThread[]): BoardThread[] {
  return [...threads].sort((left, right) => {
    if (isRecruitmentBoardCategory(left.category) && left.isRecruiting !== right.isRecruiting) {
      return Number(right.isRecruiting) - Number(left.isRecruiting);
    }
    return Date.parse(right.lastUpdated) - Date.parse(left.lastUpdated);
  });
}
