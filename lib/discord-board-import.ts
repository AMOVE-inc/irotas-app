import archive from "../data/discord-board-2026-08-14.json";
import { MEMBERS, type BoardComment, type BoardThread, type Member } from "../constants/mock-data";

interface RawRecord {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  images: string[];
  videos: string[];
  reactions?: Record<string, string[]> | null;
}

interface RawThread extends RawRecord {
  category: string;
  title: string;
  selfIntroduction?: BoardThread["selfIntroduction"];
  mealReport?: BoardThread["mealReport"];
  gourmetAdvice?: BoardThread["gourmetAdvice"];
}

interface RawComment extends RawRecord {
  threadId: string;
}

function authorFor(record: RawRecord): Member {
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

export function loadDiscordBoardArchive(): ImportedDiscordBoard {
  const rawThreads = (archive.threads as RawThread[]).filter((record) => !(
    record.category === "meal-report" &&
    record.mealReport?.rating === 1 &&
    ["IRO+運営", "IRO＋運営"].includes(record.authorName.trim())
  ));
  const visibleThreadIds = new Set(rawThreads.map((record) => record.id));
  const rawComments = (archive.comments as RawComment[]).filter((record) => visibleThreadIds.has(record.threadId));
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
      reactions: record.reactions ?? undefined,
    };
    (comments[record.threadId] ??= []).push(comment);
  });

  const threads = rawThreads.map((record): BoardThread => {
    const threadComments = comments[record.id] ?? [];
    return {
      id: record.id,
      title: record.title,
      author: authorFor(record),
      category: record.category,
      commentCount: threadComments.length,
      lastUpdated: threadComments.at(-1)?.createdAt ?? record.createdAt,
      preview: record.content,
      isRecruiting: false,
      images: record.images.length ? record.images : undefined,
      videos: record.videos.length ? record.videos : undefined,
      reactions: record.reactions ?? undefined,
      selfIntroduction: record.selfIntroduction,
      mealReport: record.mealReport,
      gourmetAdvice: record.gourmetAdvice,
    };
  });

  return { threads, comments };
}
