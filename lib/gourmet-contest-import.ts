import AsyncStorage from "@react-native-async-storage/async-storage";
import { MEMBERS, type BoardComment, type BoardThread, type Member } from "../constants/mock-data";
import { parseCsv } from "./migration-csv";

const STORAGE_KEY = "irotas_imported_gourmet_contests_v1";

export interface ImportedGourmetContest {
  thread: BoardThread;
  comments: BoardComment[];
}

export const GOURMET_CONTEST_IMPORT_COLUMNS = [
  "record_type", "contest_id", "title", "content", "author_member_id", "author_name",
  "created_at", "comment_deadline", "prize_title", "prize_description", "prize_expires_at",
  "attachment_urls", "comment_id", "heart_count", "winner_name",
];

function authorFor(memberId: string, name: string): Member {
  const existing = MEMBERS.find((member) => member.id === memberId);
  if (existing) return existing;
  return {
    id: memberId || `imported-${name || "unknown"}`,
    name: name || "旧Discordメンバー",
    avatar: MEMBERS[0].avatar,
    rank: "regular",
    points: 0,
    level: 1,
    branch: "kanto",
    generation: 1,
    bio: "",
    interests: [],
    role: "member",
    joinedAt: "2020-01-01",
  };
}

function splitUrls(value: string): string[] | undefined {
  const urls = value.split(/\s*[|\n]\s*/).map((item) => item.trim()).filter(Boolean);
  return urls.length ? urls : undefined;
}

export function parseGourmetContestImport(csvText: string): ImportedGourmetContest[] {
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error("CSVにデータ行がありません。");
  const missing = ["record_type", "contest_id", "content", "created_at"].filter((key) => !(key in rows[0]));
  if (missing.length) throw new Error(`必須列がありません: ${missing.join(", ")}`);

  const contests = new Map<string, ImportedGourmetContest>();
  for (const row of rows.filter((item) => item.record_type.toLowerCase() === "contest")) {
    if (!row.contest_id || !row.title || !row.comment_deadline) {
      throw new Error("大会行にはcontest_id・title・comment_deadlineが必要です。");
    }
    contests.set(row.contest_id, {
      thread: {
        id: `imported-contest-${row.contest_id}`,
        title: row.title,
        author: authorFor(row.author_member_id, row.author_name),
        category: "gourmet-contest",
        commentCount: 0,
        lastUpdated: row.created_at,
        preview: row.content,
        isRecruiting: false,
        images: splitUrls(row.attachment_urls),
        gourmetContest: {
          commentDeadline: row.comment_deadline,
          prizeTitle: row.prize_title || "過去グルメ選手権 優勝",
          prizeDescription: row.prize_description || "移行済みの過去大会です",
          prizeExpiresAt: row.prize_expires_at || row.comment_deadline,
          archived: true,
          winnerName: row.winner_name || undefined,
        },
      },
      comments: [],
    });
  }

  for (const row of rows.filter((item) => item.record_type.toLowerCase() === "comment")) {
    const contest = contests.get(row.contest_id);
    if (!contest) throw new Error(`コメントが参照する大会がありません: ${row.contest_id}`);
    const heartCount = Math.max(0, Number.parseInt(row.heart_count || "0", 10) || 0);
    contest.comments.push({
      id: row.comment_id || `imported-comment-${row.contest_id}-${contest.comments.length + 1}`,
      threadId: contest.thread.id,
      author: authorFor(row.author_member_id, row.author_name),
      content: row.content,
      createdAt: row.created_at,
      reactions: heartCount ? { "❤️": Array.from({ length: heartCount }, (_, index) => `imported-heart-${index + 1}`) } : undefined,
    });
  }

  const result = [...contests.values()];
  for (const contest of result) {
    contest.comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    contest.thread.commentCount = contest.comments.length;
    contest.thread.lastUpdated = contest.comments.at(-1)?.createdAt ?? contest.thread.lastUpdated;
  }
  return result.sort((a, b) => new Date(b.thread.lastUpdated).getTime() - new Date(a.thread.lastUpdated).getTime());
}

export async function saveImportedGourmetContests(items: ImportedGourmetContest[]): Promise<void> {
  const current = await loadImportedGourmetContests();
  const merged = new Map(current.map((item) => [item.thread.id, item]));
  items.forEach((item) => merged.set(item.thread.id, item));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...merged.values()]));
}

export async function loadImportedGourmetContests(): Promise<ImportedGourmetContest[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]") as ImportedGourmetContest[];
  } catch {
    return [];
  }
}
