import { MEMBERS, type BoardComment, type BoardThread, type Member } from "../constants/mock-data";
import { normalizeBoardReactions } from "./board-reactions";
import { inferImportedRecruitmentStatus } from "./board-recruitment";
import { cleanDiscordBoardContent, cleanDiscordBoardTitle } from "./discord-board-normalization";
import { displayMemberName } from "./display-name";
import { isRetiredMovieClubThread, normalizeDiscordBoardCategory } from "./board-category";
export { isRetiredMovieClubThread, normalizeDiscordBoardCategory } from "./board-category";

export interface RawDiscordBoardRecord {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  authorRank?: Member["rank"] | null;
  content: string;
  createdAt: string;
  images: string[];
  videos: string[];
  mentions?: { id: string; name: string }[];
  reactions?: Record<string, unknown> | null;
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
  threadOverrides?: Record<string, { title: string; content: string; status: "open" | "closed" | "none"; pinned: boolean; updatedAt: string; data?: Record<string, unknown> }>;
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

function rankFromDiscordName(value: string): Member["rank"] | undefined {
  if (/PLATINUM|プラチナ/i.test(value)) return "platinum";
  if (/GOLD|ゴールド/i.test(value)) return "gold";
  if (/SILVER|シルバー/i.test(value)) return "silver";
  return undefined;
}

function cleanDiscordMemberName(value: string) {
  return value.replace(/\s*【\s*(?:🥈\s*)?SILVER\s*】/gi, "").replace(/\s*【\s*(?:🥇\s*)?GOLD\s*】/gi, "").replace(/\s*【\s*(?:💎\s*)?PLATINUM\s*】/gi, "").trim();
}

function authorFor(record: RawDiscordBoardRecord, directory: DiscordMemberDirectoryRecord[] = [], fallbacks = new Map<string, { avatarUrl?: string; rank?: Member["rank"] }>()) : Member {
  const existing = MEMBERS.find((member) => member.id === record.authorId || member.name === record.authorName);
  if (existing) return existing;
  const discordId = `discord-${record.authorId}`;
  const databaseMember = directory.find((member) => member.id === discordId || member.id.endsWith(record.authorId) || member.displayName === record.authorName);
  const profile = databaseMember?.profile ?? {};
  const fallback = fallbacks.get(record.authorId);
  const avatar = typeof profile.avatarUrl === "string" ? profile.avatarUrl : typeof profile.avatar === "string" ? profile.avatar : record.authorAvatarUrl || fallback?.avatarUrl || MEMBERS[0].avatar;
  const generation = Number(databaseMember?.memberTerm?.match(/\d+/)?.[0] ?? 0);
  const rank = (["regular", "silver", "gold", "platinum"].includes(databaseMember?.memberRank ?? "") ? databaseMember!.memberRank : record.authorRank || fallback?.rank || rankFromDiscordName(record.authorName) || "regular") as Member["rank"];
  return {
    id: databaseMember?.id ?? discordId,
    name: displayMemberName(databaseMember?.displayName || cleanDiscordMemberName(record.authorName), "旧Discordメンバー"),
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

function importedGourmetContest(title: string, content: string): BoardThread["gourmetContest"] | undefined {
  const text = `${title}\n${content}`;
  if (!/開催中|開催終了/.test(text)) return undefined;
  const isOpen = /開催中/.test(text) && !/開催終了/.test(text);
  return { commentDeadline: isOpen ? "2099-12-31" : "2000-01-01", archived: !isOpen };
}

function importedGourmetAdvice(record: RawDiscordBoardThread, preview: string): BoardThread["gourmetAdvice"] | undefined {
  if (record.gourmetAdvice) return record.gourmetAdvice;
  const area = preview.match(/(?:エリア|場所)\s*[：:]\s*([^\n]+)/)?.[1]?.trim() ?? "指定なし";
  const budget = preview.match(/予算\s*[：:]\s*([^\n]+)/)?.[1]?.trim() ?? "指定なし";
  const scene = preview.match(/(?:利用シーン|シーン)\s*[：:]\s*([^\n]+)/)?.[1]?.trim() ?? "指定なし";
  return { theme: record.title, area, budget, scene, comment: preview };
}

export function stripLegacyClubApplicationBlock(content: string): string {
  return content
    .replace(/\*{0,2}📝\s*入部申請フォーム\*{0,2}[\s\S]*?https:\/\/docs\.google\.com\/forms\/[^\s*]+\*{0,2}/g, "")
    .replace(/\*{0,2}🔒\s*部員専用チャット\*{0,2}[\s\S]*?https:\/\/discord\.com\/channels\/[^\s*]+\*{0,2}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseDiscordBoardArchive(archive: RawDiscordBoardArchive, directory: DiscordMemberDirectoryRecord[] = []): ImportedDiscordBoard {
  const authorFallbacks = new Map<string, { avatarUrl?: string; rank?: Member["rank"] }>();
  for (const record of [...archive.threads, ...archive.comments]) {
    const current = authorFallbacks.get(record.authorId) ?? {};
    authorFallbacks.set(record.authorId, {
      avatarUrl: current.avatarUrl || record.authorAvatarUrl || undefined,
      rank: current.rank || record.authorRank || rankFromDiscordName(record.authorName),
    });
  }
  const rawThreads = archive.threads.filter((record) => !isRetiredMovieClubThread(record) && !(
    record.category === "meal-report" && record.mealReport?.rating === 1 &&
    ["IRO+運営", "IRO＋運営"].includes(record.authorName.trim())
  ));
  const visibleThreadIds = new Set(rawThreads.map((record) => record.id));
  const seenDiscordCommentIds = new Set<string>();
  const rawComments = archive.comments.filter((record) => {
    if (!visibleThreadIds.has(record.threadId)) return false;
    const key = `${record.threadId}:${record.id.replace(/^(?:discord-comment-)+/, "")}`;
    if (seenDiscordCommentIds.has(key)) return false;
    seenDiscordCommentIds.add(key);
    return true;
  });
  const comments: Record<string, BoardComment[]> = {};

  rawComments.forEach((record) => {
    const comment: BoardComment = {
      id: `discord-comment-${record.id}`,
      threadId: record.threadId,
      author: authorFor(record, directory, authorFallbacks),
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
    const category = normalizeDiscordBoardCategory(record.category);
    const normalizedContent = cleanDiscordBoardContent(record.title, record.content, category);
    const preview = category === "club-introduction" ? stripLegacyClubApplicationBlock(normalizedContent) : normalizedContent;
    const override = archive.threadOverrides?.[record.id];
    const recruitmentStatus = override?.status ?? inferImportedRecruitmentStatus(category, record.title, preview);
    return {
      id: record.id,
      title: override?.title ?? cleanDiscordBoardTitle(record.title),
      author: authorFor(record, directory, authorFallbacks),
      category,
      commentCount: threadComments.length,
      // 募集状態などの編集日時ではなく、最後のコメントを活動日時とする。
      lastUpdated: threadComments.at(-1)?.createdAt ?? record.createdAt,
      preview: override?.content ?? preview,
      isRecruiting: recruitmentStatus === "open",
      recruitmentStatus,
      isPinned: override?.pinned,
      images: record.images.length ? record.images : undefined,
      videos: record.videos.length ? record.videos : undefined,
      reactions: record.reactions ? normalizeBoardReactions(record.reactions) : undefined,
      selfIntroduction: record.selfIntroduction,
      mealReport: record.mealReport,
      gourmetAdvice: category === "gourmet-advice" ? importedGourmetAdvice(record, preview) : undefined,
      gourmetContest: category === "gourmet-contest" ? importedGourmetContest(record.title, preview) : undefined,
    };
  });

  return { threads, comments };
}
