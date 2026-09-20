import {
  DEFAULT_AVATAR,
  MEMBERS,
  type BoardComment,
  type BoardImage,
  type BoardThread,
  type Member,
} from "../constants/mock-data";
import type { SharedBoardComment, SharedBoardThread } from "./_core/api";
import { cleanDiscordBoardContent, cleanDiscordBoardTitle } from "./discord-board-normalization";
import { displayMemberName } from "./display-name";
import { validReplyReference } from "./reply-reference";

type ReactionSummary = Record<string, { count: number; reacted: boolean; memberIds?: string[] }>;

const durableUri = (uri: string) => /^https:\/\//i.test(uri) || uri.startsWith("/api/event-images/");
const durableImages = (images?: BoardImage[]) => images?.filter((image) =>
  typeof image === "number" || (typeof image === "string" && durableUri(image)) ||
  (typeof image === "object" && durableUri(image.uri)),
);

function memberFor(id: string, name: string, profile?: { avatarUrl?: string; memberTerm?: string; rank?: string }): Member {
  const known = MEMBERS.find((member) => member.id === id);
  if (known) return known;
  const generation = Number(profile?.memberTerm?.match(/\d+/)?.[0] ?? 0);
  const rank = ["regular", "silver", "gold", "platinum"].includes(profile?.rank ?? "") ? profile!.rank as Member["rank"] : "regular";
  return {
    id,
    name: displayMemberName(name, "メンバー"),
    avatar: profile?.avatarUrl || DEFAULT_AVATAR,
    rank,
    branch: "kanto",
    generation,
    bio: "",
    interests: [],
    role: "member",
    joinedAt: "",
    points: 0,
    level: 1,
    participationCount: 0,
    organizerCount: 0,
    followerCount: 0,
    followingCount: 0,
  };
}

function reactionArrays(summary: ReactionSummary, viewerId: string) {
  return Object.fromEntries(Object.entries(summary).map(([emoji, item]) => {
    if (item.memberIds) return [emoji, item.memberIds];
    const own = item.reacted ? [viewerId] : [];
    const remaining = Math.max(0, item.count - own.length);
    return [emoji, [...own, ...Array.from({ length: remaining }, (_, index) => `shared-reaction-${emoji}-${index}`)]];
  }));
}

export function boardThreadData(thread: BoardThread): Record<string, unknown> {
  return {
    commentCount: thread.commentCount,
    isRecruiting: thread.isRecruiting,
    recruitCapacity: thread.recruitCapacity,
    recruitAttendees: thread.recruitAttendees,
    recruitParticipants: thread.recruitParticipants,
    recruitApplicants: thread.recruitApplicants,
    chatId: thread.chatId,
    eventDate: thread.eventDate,
    images: durableImages(thread.images),
    videos: thread.videos?.filter(durableUri),
    mealReport: thread.mealReport,
    gourmetAdvice: thread.gourmetAdvice,
    selfIntroduction: thread.selfIntroduction,
    poll: thread.poll,
    gourmetContest: thread.gourmetContest,
  };
}

export function sharedThreadToBoardThread(record: SharedBoardThread, viewerId: string): BoardThread {
  const data = record.data as Partial<BoardThread>;
  return {
    id: record.id,
    createdAt: record.createdAt,
    title: cleanDiscordBoardTitle(record.title),
    author: memberFor(record.authorId, record.authorName, { avatarUrl: record.authorAvatarUrl, memberTerm: record.authorMemberTerm, rank: record.authorRank }),
    category: record.category,
    commentCount: typeof data.commentCount === "number" ? data.commentCount : 0,
    // 本文を管理側で補正しても投稿日時は変えず、コメントがあればその最新日時を表示する。
    lastUpdated: record.lastActivityAt ?? record.createdAt,
    lastCommentAt: record.lastActivityAt && record.lastActivityAt > record.createdAt ? record.lastActivityAt : undefined,
    preview: cleanDiscordBoardContent(record.title, record.content, record.category),
    isRecruiting: record.status === "open",
    recruitmentStatus: record.status,
    isPinned: record.pinned,
    recruitCapacity: data.recruitCapacity,
    recruitAttendees: data.recruitAttendees,
    recruitParticipants: data.recruitParticipants,
    recruitApplicants: data.recruitApplicants,
    chatId: data.chatId,
    eventDate: data.eventDate,
    images: data.images,
    videos: data.videos,
    mealReport: data.mealReport,
    gourmetAdvice: data.gourmetAdvice,
    selfIntroduction: data.selfIntroduction,
    poll: data.poll,
    gourmetContest: data.gourmetContest,
    reactions: reactionArrays(record.reactions, viewerId),
    shared: true,
  };
}

export function boardCommentData(comment: BoardComment): Record<string, unknown> {
  return {
    replyTo: comment.replyTo,
    images: durableImages(comment.images),
    videos: comment.videos?.filter(durableUri),
    poll: comment.poll,
    isSystem: comment.isSystem,
  };
}

export function sharedCommentToBoardComment(record: SharedBoardComment, viewerId: string): BoardComment {
  const data = record.data as Partial<BoardComment>;
  return {
    id: record.id,
    threadId: record.threadId,
    author: memberFor(record.authorId, record.authorName, { avatarUrl: record.authorAvatarUrl, memberTerm: record.authorMemberTerm, rank: record.authorRank }),
    content: record.content,
    replyTo: validReplyReference(data.replyTo) ? data.replyTo : undefined,
    createdAt: record.createdAt,
    images: data.images,
    videos: data.videos,
    poll: data.poll,
    isSystem: data.isSystem,
    reactions: reactionArrays(record.reactions, viewerId),
    shared: true,
  };
}
