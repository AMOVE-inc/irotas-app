import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BoardComment } from "@/constants/mock-data";

const THREAD_KEY = "board_thread_reactions_v1";
const COMMENT_KEY = "board_comment_reactions_v1";

type ReactionMap = Record<string, Record<string, string[]>>;

const LEGACY_DISCORD_EMOJI_IDS: Record<string, string> = {
  emoji_1: "1458866898656690246",
  emoji_3: "1458869416589529220",
  emoji_4: "1458869442909044746",
  emoji_5: "1458869474466857245",
  emoji_6: "1458869550471975023",
  emoji_7: "1458869576451358780",
  emoji_11: "1458869693862510645",
  emoji_12: "1458871164490350757",
  emoji_23: "1226010585339138080",
};

const DISCORD_EMOJI_PATTERN = /^<a?:([^:>]+):(\d+)>$/;

export function boardReactionImageUrl(value: string): string | undefined {
  const customEmoji = value.match(DISCORD_EMOJI_PATTERN);
  if (customEmoji) return `https://cdn.discordapp.com/emojis/${customEmoji[2]}.png?size=64&quality=lossless`;
  const legacyId = LEGACY_DISCORD_EMOJI_IDS[value.toLowerCase()];
  return legacyId ? `https://cdn.discordapp.com/emojis/${legacyId}.png?size=64&quality=lossless` : undefined;
}

export function boardReactionAccessibilityLabel(value: string): string {
  const customEmoji = value.match(DISCORD_EMOJI_PATTERN);
  const name = customEmoji?.[1] ?? (/^emoji_\d+$/i.test(value) ? value : undefined);
  return name ? "カスタムスタンプ" : `${value}スタンプ`;
}

export function normalizeBoardReactionEmoji(value: string): string {
  const match = value.match(DISCORD_EMOJI_PATTERN);
  if (match) return `<:${match[1]}:${match[2]}>`;
  const legacyId = LEGACY_DISCORD_EMOJI_IDS[value.toLowerCase()];
  if (legacyId) return `<:${value.toLowerCase()}:${legacyId}>`;
  if (/^emoji_\d+$/i.test(value)) return "😊";
  return value;
}

/**
 * Discord exports may contain either a list of reacting member IDs or an
 * aggregate `{ count, users }` object.  A count without user IDs cannot be
 * represented by the app's per-member reaction model, but it must never make
 * the whole imported board unreadable.
 */
export function normalizeBoardReactions(reactions: Record<string, unknown> = {}): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};
  for (const [emoji, value] of Object.entries(reactions)) {
    const memberIds = Array.isArray(value)
      ? value.filter((memberId): memberId is string => typeof memberId === "string")
      : value && typeof value === "object" && Array.isArray((value as { users?: unknown }).users)
        ? (value as { users: unknown[] }).users.filter((memberId): memberId is string => typeof memberId === "string")
        : [];
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
  return comments.map((comment) => ({ ...comment, reactions: normalizeBoardReactions(comment.shared ? comment.reactions : stored[comment.id] ?? comment.reactions) }));
}

export async function saveCommentReactions(commentId: string, reactions: Record<string, string[]>) {
  const stored = await readMap(COMMENT_KEY);
  await AsyncStorage.setItem(COMMENT_KEY, JSON.stringify({ ...stored, [commentId]: reactions }));
}
