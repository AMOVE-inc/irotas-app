import {
  CURRENT_USER,
  MEMBERS,
  type BoardComment,
  type BoardImage,
  type BoardThread,
  type Member,
} from "../constants/mock-data";
import type { SharedBoardComment, SharedBoardThread } from "./_core/api";

type ReactionSummary = Record<string, { count: number; reacted: boolean }>;

const durableImages = (images?: BoardImage[]) => images?.filter((image) =>
  typeof image === "number" || (typeof image === "string" && /^https:\/\//i.test(image)) ||
  (typeof image === "object" && /^https:\/\//i.test(image.uri)),
);

function memberFor(id: string, name: string): Member {
  return MEMBERS.find((member) => member.id === id) ?? {
    ...CURRENT_USER,
    id,
    name,
    rank: "regular",
    role: "member",
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
    videos: thread.videos?.filter((url) => /^https:\/\//i.test(url)),
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
    title: record.title,
    author: memberFor(record.authorId, record.authorName),
    category: record.category,
    commentCount: typeof data.commentCount === "number" ? data.commentCount : 0,
    lastUpdated: record.updatedAt,
    preview: record.content,
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
    images: durableImages(comment.images),
    videos: comment.videos?.filter((url) => /^https:\/\//i.test(url)),
    poll: comment.poll,
    isSystem: comment.isSystem,
  };
}

export function sharedCommentToBoardComment(record: SharedBoardComment, viewerId: string): BoardComment {
  const data = record.data as Partial<BoardComment>;
  return {
    id: record.id,
    threadId: record.threadId,
    author: memberFor(record.authorId, record.authorName),
    content: record.content,
    createdAt: record.createdAt,
    images: data.images,
    videos: data.videos,
    poll: data.poll,
    isSystem: data.isSystem,
    reactions: reactionArrays(record.reactions, viewerId),
    shared: true,
  };
}
