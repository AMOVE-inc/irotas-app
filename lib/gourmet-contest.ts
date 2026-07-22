import type { BoardComment, BoardThread, Coupon } from "@/constants/mock-data";

export function isContestCommentingOpen(thread: BoardThread, now = new Date()): boolean {
  if (!thread.gourmetContest) return false;
  return now.getTime() <= new Date(`${thread.gourmetContest.commentDeadline}T23:59:59+09:00`).getTime();
}

export function getContestWinner(comments: BoardComment[]): BoardComment | undefined {
  return [...comments]
    .sort((a, b) => {
      const hearts = (b.reactions?.["❤️"]?.length ?? 0) - (a.reactions?.["❤️"]?.length ?? 0);
      if (hearts !== 0) return hearts;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })[0];
}

export function createContestPrizeCoupon(thread: BoardThread, winnerId: string): Coupon | undefined {
  const contest = thread.gourmetContest;
  if (!contest) return undefined;
  return {
    id: `contest-prize-${thread.id}`,
    title: contest.prizeTitle,
    description: contest.prizeDescription,
    discount: "イベントクーポン",
    expiresAt: contest.prizeExpiresAt,
    code: `IRO-WINNER-${thread.id.toUpperCase()}`,
    requiredRank: "regular",
    usageType: "single",
    recipientIds: [winnerId],
    sourceContestId: thread.id,
  };
}
