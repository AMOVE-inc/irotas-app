import { MEMBERS, type BoardComment, type BoardThread, type Member } from "../constants/mock-data";
import { normalizeBoardReactions } from "./board-reactions";
import { inferImportedRecruitmentStatus } from "./board-recruitment";

export interface RawDiscordBoardRecord {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  images: string[];
  videos: string[];
  reactions?: Record<string, string[]> | null;
}

export interface RawDiscordBoardThread extends RawDiscordBoardRecord {
  category: string;
  title: string;
  selfIntroduction?: BoardThread["selfIntroduction"];
  mealReport?: BoardThread["mealReport"];
  gourmetAdvice?: BoardThread["gourmetAdvice"];
}

export interface RawDiscordBoardComment extends RawDiscordBoardRecord {
  threadId: string;
}

export interface RawDiscordBoardArchive {
  threads: RawDiscordBoardThread[];
  comments: RawDiscordBoardComment[];
}

function authorFor(record: RawDiscordBoardRecord): Member {
  const existing = MEMBERS.find((member) => member.id === record.authorId || member.name === record.authorName);
  if (existing) return existing;
  return {
    id: `discord-${record.authorId}`,
    name: record.authorName || "旧Discordメンバー",
    avatar: MEMBERS[0].avatar,
    rank: "regular",
    points: 0,
    level: 1,
    branch: "kanto",
    generation: 1,
    bio: "",
    interests: [],
    role: "member",
    joinedAt: "2024-01-01",
  };
}

export interface ImportedDiscordBoard {
  threads: BoardThread[];
  comments: Record<string, BoardComment[]>;
}

export function stripLegacyClubApplicationBlock(content: string): string {
  return content
    .replace(/\*{0,2}📝\s*入部申請フォーム\*{0,2}[\s\S]*?https:\/\/docs\.google\.com\/forms\/[^\s*]+\*{0,2}/g, "")
    .replace(/\*{0,2}🔒\s*部員専用チャット\*{0,2}[\s\S]*?https:\/\/discord\.com\/channels\/[^\s*]+\*{0,2}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseDiscordBoardArchive(archive: RawDiscordBoardArchive): ImportedDiscordBoard {
  const rawThreads = archive.threads.filter((record) => !(
    record.category === "meal-report" &&
    record.mealReport?.rating === 1 &&
    ["IRO+運営", "IRO＋運営"].includes(record.authorName.trim())
  ));
  const visibleThreadIds = new Set(rawThreads.map((record) => record.id));
  const rawComments = archive.comments.filter((record) => visibleThreadIds.has(record.threadId));
  const comments: Record<string, BoardComment[]> = {};

  rawComments.forEach((record) => {
    const comment: BoardComment = {
      id: `discord-comment-${record.id}`,
      threadId: record.threadId,
      author: authorFor(record),
      content: record.content,
      createdAt: record.createdAt,
      images: record.images.length ? record.images : undefined,
      videos: record.videos.length ? record.videos : undefined,
      reactions: record.reactions ? normalizeBoardReactions(record.reactions) : undefined,
    };
    (comments[record.threadId] ??= []).push(comment);
  });

  const threads = rawThreads.map((record): BoardThread => {
    const threadComments = comments[record.id] ?? [];
    const preview = record.category === "club-introduction" ? stripLegacyClubApplicationBlock(record.content) : record.content;
    const recruitmentStatus = inferImportedRecruitmentStatus(record.category, record.title, preview);
    return {
      id: record.id,
      title: record.title,
      author: authorFor(record),
      category: record.category,
      commentCount: threadComments.length,
      lastUpdated: threadComments.at(-1)?.createdAt ?? record.createdAt,
      preview,
      isRecruiting: recruitmentStatus === "open",
      recruitmentStatus,
      images: record.images.length ? record.images : undefined,
      videos: record.videos.length ? record.videos : undefined,
      reactions: record.reactions ? normalizeBoardReactions(record.reactions) : undefined,
      selfIntroduction: record.selfIntroduction,
      mealReport: record.mealReport,
      gourmetAdvice: record.gourmetAdvice,
    };
  });

  return { threads, comments };
}
