/**
 * チャットストア
 * - イベント参加後に参加者専用チャットルームを動的に管理
 * - 掲示板の参加者選定後にチャットルームを自動生成
 * - CHAT_ROOMS / CHAT_MESSAGES のモックデータと統合
 * - AsyncStorageでメッセージを永続化
 */
import { CHAT_ROOMS, CHAT_MESSAGES, RANK_LABELS, type ChatRoom, type ChatMessage, type MemberRank } from "@/constants/mock-data";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { areFriends } from "@/lib/friendship";
import { sortRoomsByRecent } from "@/lib/chat-order";
import { toggleReactionMember } from "@/lib/chat-reactions";
import { recordHomeActivity } from "@/lib/home-activity-store";
export { sortRoomsByRecent } from "@/lib/chat-order";

// 動的に追加されたチャットルーム（セッション中のみ保持）
export const dynamicRooms: ChatRoom[] = [];

// 動的に追加されたメッセージ
export const dynamicMessages: ChatMessage[] = [];

// AsyncStorageキープレフィックス
const MESSAGES_KEY_PREFIX = "chat_messages_";
const ROOMS_KEY = "chat_dynamic_rooms";
const ROOM_PARTICIPANTS_KEY = "chat_room_participants";
const READ_ROOMS_KEY = "chat_read_rooms";

// チャットIDごとの書き込みチェーン（同時書き込み競合防止）
const messageWriteChains: Record<string, Promise<void>> = {};
const unreadListeners = new Set<() => void>();

function enqueueMessageWrite(chatId: string, fn: () => Promise<void>): Promise<void> {
  const prev = messageWriteChains[chatId] ?? Promise.resolve();
  const next = prev.then(fn).catch(() => {});
  messageWriteChains[chatId] = next;
  return next;
}

/** 全チャットルームを取得（モック + 動的追加分） */
export function getAllRooms(): ChatRoom[] {
  return [...CHAT_ROOMS, ...dynamicRooms];
}

/** 全メッセージを取得（モック + 動的追加分） */
export function getAllMessages(): ChatMessage[] {
  return [...CHAT_MESSAGES, ...dynamicMessages];
}

/** IDでチャットルームを取得 */
export function getRoomById(id: string): ChatRoom | undefined {
  return getAllRooms().find((r) => r.id === id);
}

/** 自分が参加しているチャットルームを取得 */
export function getMyRooms(userId: string): ChatRoom[] {
  return getAllRooms().filter((r) => r.participants.includes(userId));
}

export async function applyReadRoomState(rooms: ChatRoom[]): Promise<ChatRoom[]> {
  const raw = await AsyncStorage.getItem(READ_ROOMS_KEY);
  const readIds = new Set<string>(raw ? JSON.parse(raw) : []);
  return sortRoomsByRecent(rooms).map((room) => !room.shared && readIds.has(room.id) ? { ...room, unreadCount: 0, mentionCount: 0 } : room);
}

export async function markRoomRead(roomId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(READ_ROOMS_KEY);
  const readIds = new Set<string>(raw ? JSON.parse(raw) : []);
  readIds.add(roomId);
  await AsyncStorage.setItem(READ_ROOMS_KEY, JSON.stringify([...readIds]));
  const room = getRoomById(roomId);
  if (room) {
    room.unreadCount = 0;
    room.mentionCount = 0;
  }
  unreadListeners.forEach((listener) => listener());
}

export function subscribeUnreadChanges(listener: () => void): () => void {
  unreadListeners.add(listener);
  return () => unreadListeners.delete(listener);
}

export async function getUnreadTotalForUser(userId: string, rank: string): Promise<number> {
  const rooms = [...getMyRooms(userId).filter((room) => room.type !== "rank"), ...getRankRoomsForUser(rank)];
  const withReadState = await applyReadRoomState(rooms);
  return withReadState.reduce((total, room) => total + (room.unreadCount ?? 0), 0);
}

/**
 * ユーザーのランクに応じて参加できるランク別チャットルームを取得
 * ルール: 自分と同じランクのルームだけに参加できる
 */
export function getRankRoomsForUser(userRank: string): ChatRoom[] {
  return getAllRooms().filter(
    (r) => r.type === "rank" && r.requiredRank === userRank,
  );
}

/** ランク昇格時に対象の限定チャットへ参加させ、歓迎通知を自動投稿する。 */
export async function sendRankUpgradeWelcome(memberId: string, memberName: string, newRank: MemberRank): Promise<ChatMessage | undefined> {
  if (newRank === "regular") return undefined;
  const room = getAllRooms().find((item) => item.type === "rank" && item.requiredRank === newRank);
  if (!room) return undefined;
  if (!room.participants.includes(memberId)) room.participants.push(memberId);
  const content = `@${memberName}さん\nようこそ、${RANK_LABELS[newRank]}会員限定チャットへ！みんなで歓迎しましょう！🎉`;
  const message = addMessage(room.id, "system", content);
  room.unreadCount = (room.unreadCount ?? 0) + 1;
  await Promise.all([saveDynamicRooms(), saveMessagesToStorage(room.id, [message])]);
  unreadListeners.forEach((listener) => listener());
  return message;
}

/** 相互に友達のメンバーを招待して通常のグループチャットを作成する。 */
export function createFriendGroupChat(
  name: string,
  friendIds: string[],
  createdBy: string,
): ChatRoom {
  const uniqueFriendIds = [...new Set(friendIds)].filter((id) => id !== createdBy);
  if (!name.trim()) throw new Error("チャット名を入力してください");
  if (uniqueFriendIds.length < 2) throw new Error("友達を2人以上選択してください");
  if (uniqueFriendIds.some((id) => !areFriends(createdBy, id))) {
    throw new Error("相互に友達ではないメンバーは招待できません");
  }

  const roomId = `group_${createdBy}_${Date.now()}`;
  const newRoom: ChatRoom = {
    id: roomId,
    name: name.trim(),
    type: "group",
    sourceId: roomId,
    participants: [createdBy, ...uniqueFriendIds],
    createdBy,
    lastMessage: "グループチャットが作成されました",
    lastMessageAt: new Date().toISOString(),
  };
  dynamicRooms.push(newRoom);

  const welcomeMsg: ChatMessage = {
    id: `msg_welcome_${roomId}`,
    chatId: roomId,
    senderId: "system",
    content: `「${newRoom.name}」へようこそ！`,
    createdAt: new Date().toISOString(),
  };
  dynamicMessages.push(welcomeMsg);
  void saveDynamicRooms();
  void saveMessagesToStorage(roomId, [welcomeMsg]);
  return newRoom;
}

/** イベント参加時: チャットルームに参加者を追加（なければ新規作成） */
export function joinEventChat(
  eventId: string,
  eventTitle: string,
  chatId: string | undefined,
  userId: string,
): ChatRoom {
  // 既存のチャットルームを探す
  const existingRoom = getAllRooms().find(
    (r) => r.sourceId === eventId && r.type === "event",
  );

  if (existingRoom) {
    // 既存ルームに参加者追加
    if (!existingRoom.participants.includes(userId)) {
      existingRoom.participants.push(userId);
    }
    return existingRoom;
  }

  // 新規チャットルーム作成
  const newRoom: ChatRoom = {
    id: chatId ?? `event_chat_${eventId}_${Date.now()}`,
    name: eventTitle,
    type: "event",
    sourceId: eventId,
    participants: [userId],
    createdBy: userId,
    lastMessage: "チャットが開始されました",
    lastMessageAt: new Date().toISOString(),
  };
  dynamicRooms.push(newRoom);

  // ウェルカムメッセージを追加
  const welcomeMsg: ChatMessage = {
    id: `msg_welcome_${newRoom.id}`,
    chatId: newRoom.id,
    senderId: "system",
    content: `【IRO+ システム】「${eventTitle}」の参加者専用チャットへようこそ！`,
    createdAt: new Date().toISOString(),
  };
  dynamicMessages.push(welcomeMsg);

  // 永続化
  saveDynamicRooms();
  saveMessagesToStorage(newRoom.id, [welcomeMsg]);

  return newRoom;
}

/** 掲示板の参加者選定後: チャットルームを新規作成 */
export function createBoardChat(
  threadId: string,
  threadTitle: string,
  participantIds: string[],
  createdBy: string,
): ChatRoom {
  // 既存のチャットルームを探す
  const existingRoom = getAllRooms().find(
    (r) => r.sourceId === threadId && r.type === "board",
  );
  if (existingRoom) {
    // 参加者を更新
    for (const id of participantIds) {
      if (!existingRoom.participants.includes(id)) {
        existingRoom.participants.push(id);
      }
    }
    return existingRoom;
  }

  const newRoom: ChatRoom = {
    id: `board_chat_${threadId}_${Date.now()}`,
    name: threadTitle,
    type: "board",
    sourceId: threadId,
    participants: participantIds,
    createdBy,
    lastMessage: "チャットが開始されました",
    lastMessageAt: new Date().toISOString(),
  };
  dynamicRooms.push(newRoom);

  const welcomeMsg: ChatMessage = {
    id: `msg_welcome_${newRoom.id}`,
    chatId: newRoom.id,
    senderId: "system",
    content: `「${threadTitle}」の参加者専用チャットへようこそ！`,
    createdAt: new Date().toISOString(),
  };
  dynamicMessages.push(welcomeMsg);

  // 永続化
  saveDynamicRooms();
  saveMessagesToStorage(newRoom.id, [welcomeMsg]);

  return newRoom;
}

/** 1対1ダイレクトメッセージのチャットルームを作成または取得する */
export function getOrCreateDMChat(
  userId1: string,
  userId2: string,
  user2Name: string,
): string {
  // 既存のDMルームを探す
  const existing = getAllRooms().find(
    (r) =>
      (r.type as string) === "dm" &&
      r.participants.includes(userId1) &&
      r.participants.includes(userId2) &&
      r.participants.length === 2,
  );
  if (existing) return existing.id;

  const roomId = `dm_${[userId1, userId2].sort().join("_")}_${Date.now()}`;
  const newRoom: ChatRoom = {
    id: roomId,
    name: user2Name,
    type: "dm" as ChatRoom["type"],
    sourceId: roomId,
    participants: [userId1, userId2],
    createdBy: userId1,
    lastMessage: "",
    lastMessageAt: new Date().toISOString(),
  };
  dynamicRooms.push(newRoom);
  saveDynamicRooms();
  return roomId;
}

/** チャットにメッセージを追加 */
export function addMessage(chatId: string, senderId: string, content: string): ChatMessage {
  const msg: ChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    chatId,
    senderId,
    content,
    createdAt: new Date().toISOString(),
  };
  dynamicMessages.push(msg);

  // ルームのlastMessageを更新
  const room = getAllRooms().find((r) => r.id === chatId);
  if (room) {
    room.lastMessage = content;
    room.lastMessageAt = msg.createdAt;
  }
  if (chatId === "board-announcement") {
    void recordHomeActivity({ id: `announcement:${msg.id}`, kind: "announcement", title: "運営アナウンスが更新されました", description: content, createdAt: msg.createdAt, route: "/chat", params: { id: chatId } });
  }

  return msg;
}

/** チャットのメッセージ一覧を取得 */
export function getMessages(chatId: string): ChatMessage[] {
  return getAllMessages()
    .filter((m) => m.chatId === chatId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** メッセージへの絵文字リアクションを切り替える。リアクションでは通知を送らない。 */
export async function toggleMessageReaction(
  chatId: string,
  messageId: string,
  emoji: string,
  memberId: string,
): Promise<ChatMessage | undefined> {
  const message = getAllMessages().find((item) => item.chatId === chatId && item.id === messageId);
  if (!message) return undefined;
  const reactions = toggleReactionMember(message.reactions, emoji, memberId);
  message.reactions = reactions;

  await enqueueMessageWrite(chatId, async () => {
    const key = `${MESSAGES_KEY_PREFIX}${chatId}`;
    const stored = await loadMessagesFromStorage(chatId);
    const index = stored.findIndex((item) => item.id === messageId);
    if (index >= 0) stored[index] = { ...message };
    else stored.push({ ...message });
    await AsyncStorage.setItem(key, JSON.stringify(stored.slice(-500)));
  });
  return { ...message, reactions: { ...reactions } };
}

// ─── AsyncStorage 永続化ヘルパー ───────────────────────────────────────────

/** 特定チャットのメッセージをAsyncStorageに保存（チャットIDごとにシリアライズ） */
export function saveMessagesToStorage(chatId: string, msgs: ChatMessage[]): Promise<void> {
  return enqueueMessageWrite(chatId, async () => {
    const key = `${MESSAGES_KEY_PREFIX}${chatId}`;
    // 既存の保存済みメッセージと結合（重複排除）
    const existing = await loadMessagesFromStorage(chatId);
    const existingIds = new Set(existing.map((m) => m.id));
    const merged = [...existing, ...msgs.filter((m) => !existingIds.has(m.id))];
    // 最大500件に制限
    const trimmed = merged.slice(-500);
    await AsyncStorage.setItem(key, JSON.stringify(trimmed));
  });
}

/** 特定チャットのメッセージをAsyncStorageから読み込む */
export async function loadMessagesFromStorage(chatId: string): Promise<ChatMessage[]> {
  try {
    const key = `${MESSAGES_KEY_PREFIX}${chatId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

/** 動的ルームをAsyncStorageに保存 */
async function saveDynamicRooms(): Promise<void> {
  try {
    await AsyncStorage.setItem(ROOMS_KEY, JSON.stringify(dynamicRooms));
  } catch {
    // 無視
  }
}

async function saveRoomParticipants(room: ChatRoom): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ROOM_PARTICIPANTS_KEY);
    const state = raw ? JSON.parse(raw) as Record<string, string[]> : {};
    state[room.id] = [...room.participants];
    await AsyncStorage.setItem(ROOM_PARTICIPANTS_KEY, JSON.stringify(state));
  } catch {
    // 無視
  }
}

/** ルームの名前を変更（動的ルームのみ対応） */
export async function renameRoom(roomId: string, newName: string): Promise<boolean> {
  const room = dynamicRooms.find((r) => r.id === roomId);
  if (!room) return false;
  room.name = newName;
  await saveDynamicRooms();
  return true;
}

/** ルームにメンバーを追加（静的ルームも対応） */
export async function addMemberToRoom(roomId: string, memberId: string): Promise<boolean> {
  // 動的ルームを優先して探す
  let room = dynamicRooms.find((r) => r.id === roomId);
  if (!room) {
    // 静的ルームも探す（直接変更可能）
    room = CHAT_ROOMS.find((r) => r.id === roomId);
  }
  if (!room) return false;
  if (room.type === "group" && !areFriends(room.createdBy, memberId)) return false;
  if (!room.participants.includes(memberId)) {
    room.participants.push(memberId);
    await saveDynamicRooms();
    await saveRoomParticipants(room);
  }
  return true;
}

/** ルームからメンバーを削除（静的ルームも対応） */
export async function removeMemberFromRoom(roomId: string, memberId: string): Promise<boolean> {
  let room = dynamicRooms.find((r) => r.id === roomId);
  if (!room) {
    room = CHAT_ROOMS.find((r) => r.id === roomId);
  }
  if (!room) return false;
  const idx = room.participants.indexOf(memberId);
  if (idx !== -1) {
    room.participants.splice(idx, 1);
    await saveDynamicRooms();
    await saveRoomParticipants(room);
  }
  return true;
}

/** 動的ルームをAsyncStorageから復元（アプリ起動時に呼ぶ） */
export async function loadDynamicRooms(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ROOMS_KEY);
    const rooms = raw ? JSON.parse(raw) as ChatRoom[] : [];
    // 既に存在するIDは追加しない
    const existingIds = new Set(dynamicRooms.map((r) => r.id));
    for (const room of rooms) {
      if (!existingIds.has(room.id)) {
        dynamicRooms.push(room);
      }
    }
    const participantRaw = await AsyncStorage.getItem(ROOM_PARTICIPANTS_KEY);
    const participantState = participantRaw ? JSON.parse(participantRaw) as Record<string, string[]> : {};
    for (const room of getAllRooms()) {
      if (participantState[room.id]) room.participants = [...participantState[room.id]];
    }
  } catch {
    // 無視
  }
}
