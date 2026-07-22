import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BoardComment } from "@/constants/mock-data";

const THREAD_KEY = "board_thread_reactions_v1";
const COMMENT_KEY = "board_comment_reactions_v1";

type ReactionMap = Record<string, Record<string, string[]>>;

async function readMap(key: string): Promise<ReactionMap> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) as ReactionMap : {};
  } catch {
    return {};
  }
}

export async function loadThreadReactions(threadId: string, fallback: Record<string, string[]> = {}) {
  const stored = await readMap(THREAD_KEY);
  return stored[threadId] ?? fallback;
}

export async function saveThreadReactions(threadId: string, reactions: Record<string, string[]>) {
  const stored = await readMap(THREAD_KEY);
  await AsyncStorage.setItem(THREAD_KEY, JSON.stringify({ ...stored, [threadId]: reactions }));
}

export async function loadCommentReactions(comments: BoardComment[]): Promise<BoardComment[]> {
  const stored = await readMap(COMMENT_KEY);
  return comments.map((comment) => ({ ...comment, reactions: stored[comment.id] ?? comment.reactions }));
}

export async function saveCommentReactions(commentId: string, reactions: Record<string, string[]>) {
  const stored = await readMap(COMMENT_KEY);
  await AsyncStorage.setItem(COMMENT_KEY, JSON.stringify({ ...stored, [commentId]: reactions }));
}
