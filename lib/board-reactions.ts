import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BoardComment } from "@/constants/mock-data";

const THREAD_KEY = "board_thread_reactions_v1";
const COMMENT_KEY = "board_comment_reactions_v1";

type ReactionMap = Record<string, Record<string, string[]>>;

export function normalizeBoardReactionEmoji(value: string): string {
  const match = value.match(/^<a?:([^:>]+):\d+>$/);
  if (!match) return value;
  const name = match[1].toLowerCase();
  if (/heart|love|like/.test(name)) return "❤️";
  if (/clap|applause/.test(name)) return "👏";
  if (/party|congrat|celebrat/.test(name)) return "🎉";
  if (/yum|delicious|food/.test(name)) return "😋";
  return "😊";
}

export function normalizeBoardReactions(reactions: Record<string, string[]> = {}): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};
  for (const [emoji, memberIds] of Object.entries(reactions)) {
    const key = normalizeBoardReactionEmoji(emoji);
    normalized[key] = Array.from(new Set([...(normalized[key] ?? []), ...memberIds]));
  }
  return normalized;
}

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
  return normalizeBoardReactions(stored[threadId] ?? fallback);
}

export async function saveThreadReactions(threadId: string, reactions: Record<string, string[]>) {
  const stored = await readMap(THREAD_KEY);
  await AsyncStorage.setItem(THREAD_KEY, JSON.stringify({ ...stored, [threadId]: reactions }));
}

export async function loadCommentReactions(comments: BoardComment[]): Promise<BoardComment[]> {
  const stored = await readMap(COMMENT_KEY);
  return comments.map((comment) => ({ ...comment, reactions: normalizeBoardReactions(stored[comment.id] ?? comment.reactions) }));
}

export async function saveCommentReactions(commentId: string, reactions: Record<string, string[]>) {
  const stored = await readMap(COMMENT_KEY);
  await AsyncStorage.setItem(COMMENT_KEY, JSON.stringify({ ...stored, [commentId]: reactions }));
}
