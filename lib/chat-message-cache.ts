import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ChatMessage } from "@/constants/mock-data";

const CACHE_PREFIX = "irotas_chat_message_snapshot_v1:";
const memoryCache = new Map<string, ChatMessage[]>();

function cacheKey(memberId: string, roomId: string) {
  return `${CACHE_PREFIX}${memberId}:${roomId}`;
}

function copyMessages(messages: readonly ChatMessage[]) {
  return messages.map((message) => ({
    ...message,
    reactions: message.reactions ? Object.fromEntries(Object.entries(message.reactions).map(([emoji, memberIds]) => [emoji, [...memberIds]])) : undefined,
    attachmentUrls: message.attachmentUrls ? [...message.attachmentUrls] : undefined,
  }));
}

export function getCachedChatMessages(memberId: string, roomId: string): ChatMessage[] {
  return copyMessages(memoryCache.get(cacheKey(memberId, roomId)) ?? []);
}

export async function loadCachedChatMessages(memberId: string, roomId: string): Promise<ChatMessage[]> {
  const key = cacheKey(memberId, roomId);
  const memory = memoryCache.get(key);
  if (memory) return copyMessages(memory);
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) as ChatMessage[] : [];
    if (!Array.isArray(parsed)) return [];
    memoryCache.set(key, parsed.slice(-100));
    return copyMessages(parsed.slice(-100));
  } catch {
    return [];
  }
}

export async function cacheChatMessages(memberId: string, roomId: string, messages: readonly ChatMessage[]): Promise<void> {
  const key = cacheKey(memberId, roomId);
  const snapshot = copyMessages(messages.slice(-100));
  memoryCache.set(key, snapshot);
  try { await AsyncStorage.setItem(key, JSON.stringify(snapshot)); } catch { /* Cache writes must never block chat. */ }
}

export async function clearChatMessageCache(): Promise<void> {
  memoryCache.clear();
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(CACHE_PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch { /* A failed cache cleanup must not remove user-created data. */ }
}
