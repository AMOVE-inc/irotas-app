import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BoardComment, BoardThread, Coupon } from "@/constants/mock-data";
import { adjustIrotasPoints } from "./irotas-points-store";

const CONTEST_AWARD_KEY = "irotas_gourmet_contest_awards_v1";

export interface ContestEntryFields {
  restaurant: string;
  menu: string;
  pitch: string;
  referenceUrl?: string;
}

export function isContestEntryValid(fields: ContestEntryFields): boolean {
  const referenceUrl = fields.referenceUrl?.trim() ?? "";
  return Boolean(fields.restaurant.trim() && fields.menu.trim() && fields.pitch.trim() && (!referenceUrl || /^https?:\/\/\S+$/i.test(referenceUrl)));
}

export function buildContestEntryContent(fields: ContestEntryFields): string {
  const referenceUrl = fields.referenceUrl?.trim() ?? "";
  const referenceLine = referenceUrl ? `\n・参考URL（食べログ・GoogleMapなど）：${referenceUrl}` : "";
  return `・店名 / 場所：${fields.restaurant.trim()}\n・メニュー / 商品名：${fields.menu.trim()}\n・推しポイント（一言でOK）：${fields.pitch.trim()}${referenceLine}`;
}

export function isContestCommentingOpen(thread: BoardThread, now = new Date()): boolean {
  if (!thread.gourmetContest) return false;
  return now.getTime() <= new Date(`${thread.gourmetContest.commentDeadline}T23:59:59+09:00`).getTime();
}

export function getContestWinner(comments: BoardComment[]): BoardComment | undefined {
  return comments.filter((comment) => !comment.isSystem).sort((a, b) => {
      const hearts = (b.reactions?.["❤️"]?.length ?? 0) - (a.reactions?.["❤️"]?.length ?? 0);
      if (hearts !== 0) return hearts;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })[0];
}

export function createContestAwardComment(thread: BoardThread, winner: BoardComment): BoardComment | undefined {
  const points = thread.gourmetContest?.prizePoints;
  if (!thread.gourmetContest || thread.gourmetContest.archived || !points) return undefined;
  const contestTitle = thread.title.includes("選手権") ? thread.title : `${thread.title}選手権`;
  const prizeLabel = thread.gourmetContest.prizeTitle ?? `IRO+ポイント ${points.toLocaleString("ja-JP")}pt`;
  return {
    id: `contest-award-${thread.id}`,
    threadId: thread.id,
    author: thread.author,
    isSystem: true,
    createdAt: `${thread.gourmetContest.commentDeadline}T23:59:59+09:00`,
    content: `@everyone\n\n**# ${contestTitle}** 結果発表🏆\n\n見事一位に選ばれたのは...\n**@${winner.author.name}   さん！おめでとうございます🎉**\n景品として**【${prizeLabel}】**をプレゼントさせていただきます🎁\n\nぜひ次回のグルメ選手権もご参加お待ちしております！`,
  };
}

/** 同じ大会でポイントを二重付与しないよう、端末保存の確定記録を使う。 */
export async function awardContestWinnerOnce(thread: BoardThread, winner: BoardComment): Promise<boolean> {
  const points = thread.gourmetContest?.prizePoints;
  if (!points || thread.gourmetContest?.archived) return false;
  const raw = await AsyncStorage.getItem(CONTEST_AWARD_KEY);
  const awarded = raw ? JSON.parse(raw) as Record<string, string> : {};
  if (awarded[thread.id]) return false;
  await adjustIrotasPoints(winner.author.id, winner.author.name, points, `グルメ選手権「${thread.title}」優勝`);
  awarded[thread.id] = winner.author.id;
  await AsyncStorage.setItem(CONTEST_AWARD_KEY, JSON.stringify(awarded));
  return true;
}

export function createContestPrizeCoupon(thread: BoardThread, winnerId: string): Coupon | undefined {
  const contest = thread.gourmetContest;
  if (!contest || contest.archived) return undefined;
  return {
    id: `contest-prize-${thread.id}`,
    title: contest.prizeTitle ?? "グルメ選手権 優勝クーポン",
    description: contest.prizeDescription ?? "グルメ選手権の優勝特典です。",
    discount: "イベントクーポン",
    expiresAt: contest.prizeExpiresAt ?? contest.commentDeadline,
    code: `IRO-WINNER-${thread.id.toUpperCase()}`,
    requiredRank: "regular",
    usageType: "single",
    recipientIds: [winnerId],
    sourceContestId: thread.id,
  };
}
