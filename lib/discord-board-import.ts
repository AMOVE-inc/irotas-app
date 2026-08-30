import { MEMBERS, type BoardComment, type BoardThread, type Member } from "../constants/mock-data";
import { normalizeBoardReactions } from "./board-reactions";
import { inferImportedRecruitmentStatus } from "./board-recruitment";
import { cleanDiscordBoardContent, cleanDiscordBoardTitle } from "./discord-board-normalization";

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

export interface DiscordMemberDirectoryRecord {
  id: string;
  displayName: string;
  accessRole: "member" | "club_leader" | "operator" | "admin";
  branches: string[];
  memberTerm: string | null;
  memberRank: string;
  joinedAt: string;
  profile: Record<string, unknown>;
  xp: number;
}

function authorFor(record: RawDiscordBoardRecord, directory: DiscordMemberDirectoryRecord[] = []): Member {
  const existing = MEMBERS.find((member) => member.id === record.authorId || member.name === record.authorName);
  if (existing) return existing;
  const discordId = `discord-${record.authorId}`;
  const databaseMember = directory.find((member) => member.id === discordId || member.id.endsWith(record.authorId) || member.displayName === record.authorName);
  const profile = databaseMember?.profile ?? {};
  const avatar = typeof profile.avatarUrl === "string" ? profile.avatarUrl : typeof profile.avatar === "string" ? profile.avatar : MEMBERS[0].avatar;
  const generation = Number(databaseMember?.memberTerm?.match(/\d+/)?.[0] ?? 0);
  const rank = (["regular", "silver", "gold", "platinum"].includes(databaseMember?.memberRank ?? "") ? databaseMember!.memberRank : "regular") as Member["rank"];
  return {
    id: databaseMember?.id ?? discordId,
    name: databaseMember?.displayName || record.authorName || "旧Discordメンバー",
    avatar,
    rank,
    points: databaseMember?.xp ?? 0,
    level: 1,
    branch: databaseMember?.branches.includes("kansai") ? "kansai" : "kanto",
    generation,
    bio: typeof profile.bio === "string" ? profile.bio : "",
    interests: [],
    role: databaseMember?.accessRole === "admin" ? "admin" : databaseMember?.accessRole === "operator" ? "operator" : "member",
    joinedAt: databaseMember?.joinedAt ?? "",
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

export function parseDiscordBoardArchive(archive: RawDiscordBoardArchive, directory: DiscordMemberDirectoryRecord[] = []): ImportedDiscordBoard {
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
      author: authorFor(record, directory),
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
    const normalizedContent = cleanDiscordBoardContent(record.title, record.content, record.category);
    const preview = record.category === "club-introduction" ? stripLegacyClubApplicationBlock(normalizedContent) : normalizedContent;
    const recruitmentStatus = inferImportedRecruitmentStatus(record.category, record.title, preview);
    return {
      id: record.id,
      title: cleanDiscordBoardTitle(record.title),
      author: authorFor(record, directory),
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
