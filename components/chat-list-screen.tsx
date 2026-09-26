import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CHAT_ROOMS, CURRENT_USER, DEFAULT_AVATAR, type ChatMessage, type ChatRoom } from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { isOperatorRole } from "@/lib/access-control";
import { applyReadRoomState, getMyRooms, getRankRoomsForUser, loadDynamicRooms, markRoomRead, sortRoomsByRecent } from "@/lib/chat-store";
import { markChatRoomOptimisticallyRead } from "@/lib/chat-unread-sync";
import { canAccessRankRoom } from "@/lib/chat-access";
import { useColors } from "@/hooks/use-colors";
import { AuthenticatedImage as Image } from "@/components/authenticated-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, FlatList, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Api from "@/lib/_core/api";
import { stripRankFromName } from "@/components/member-rank-badge";
import { getDiscordAuthorById, getDiscordAuthorByName } from "@/lib/discord-author-directory";
import { mergeSentChatPreview, sentChatPreview, type SentChatPreview } from "@/lib/chat-list-preview";

function formatEventStart(event: { date: string; time: string }) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.date);
  if (!match) return [event.date, event.time].filter(Boolean).join(" ");
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay();
  return `${Number(match[2])}/${Number(match[3])}(${["日", "月", "火", "水", "木", "金", "土"][day]})${event.time ? ` ${event.time}` : ""}`;
}

const lastRoomLists = new Map<string, { joined: ChatRoom[]; rank: ChatRoom[] }>();
const recentlySentPreviews = new Map<string, SentChatPreview>();
const dismissedRooms = new Map<string, Set<string>>();
const dismissedAt = new Map<string, number>();
type ChatListPreferences = { pinnedRoomIds: string[]; hiddenRoomIds: string[] };

function chatListPreferencesKey(memberId: string) {
  return `irotas_chat_list_preferences_v1:${memberId}`;
}

async function loadChatListPreferences(memberId: string): Promise<ChatListPreferences> {
  try {
    const value = JSON.parse(await AsyncStorage.getItem(chatListPreferencesKey(memberId)) ?? "{}") as Partial<ChatListPreferences>;
    return {
      pinnedRoomIds: Array.isArray(value.pinnedRoomIds) ? value.pinnedRoomIds.filter((id): id is string => typeof id === "string") : [],
      hiddenRoomIds: Array.isArray(value.hiddenRoomIds) ? value.hiddenRoomIds.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return { pinnedRoomIds: [], hiddenRoomIds: [] };
  }
}

function withRecentlySentPreview(memberId: string, room: ChatRoom): ChatRoom {
  const key = `${memberId}:${room.id}`;
  const preview = recentlySentPreviews.get(key);
  if (!preview) return room;
  const merged = mergeSentChatPreview(room, preview);
  if (merged === room) recentlySentPreviews.delete(key);
  return merged;
}

export function showSentChatPreviewImmediately(memberId: string, roomId: string, message: ChatMessage) {
  const preview = sentChatPreview(message);
  recentlySentPreviews.set(`${memberId}:${roomId}`, preview);
  const saved = lastRoomLists.get(memberId);
  if (saved) lastRoomLists.set(memberId, {
    joined: sortRoomsByRecent(saved.joined.map((room) => room.id === roomId ? mergeSentChatPreview(room, preview) : room)),
    rank: sortRoomsByRecent(saved.rank.map((room) => room.id === roomId ? mergeSentChatPreview(room, preview) : room)),
  });
  if (Platform.OS === "web" && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("irotas-chat-message-sent", { detail: { memberId, roomId, preview } }));
}

export function dismissChatRoomImmediately(memberId: string, roomId: string) {
  const dismissed = dismissedRooms.get(memberId) ?? new Set<string>();
  dismissed.add(roomId);
  dismissedRooms.set(memberId, dismissed);
  dismissedAt.set(`${memberId}:${roomId}`, Date.now());
  const saved = lastRoomLists.get(memberId);
  if (saved) lastRoomLists.set(memberId, {
    joined: saved.joined.filter((room) => room.id !== roomId),
    rank: saved.rank.filter((room) => room.id !== roomId),
  });
  if (Platform.OS === "web" && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("irotas-chat-dismissed", { detail: { memberId, roomId } }));
}

const isImportedEventChat = (room: ChatRoom) => room.type === "event" && typeof room.sourceId === "string" && room.sourceId.startsWith("discord-event-");

function ChatRoomCard({ room, eventStarts, eventImages, memberAvatars, viewerMemberId, onOpened, onLongPress, pinned }: {
  room: ChatRoom;
  eventStarts: Record<string, string>;
  eventImages: Record<string, string>;
  memberAvatars: Record<string, string>;
  viewerMemberId: string;
  onOpened: (roomId: string, unreadCount: number) => void;
  onLongPress?: (room: ChatRoom) => void;
  pinned?: boolean;
}) {
  const colors = useColors();
  const router = useRouter();
  const longPressHandled = useRef(false);
  const isDM = room.type === "dm";
  const isGroup = room.type === "group";
  const isRank = room.type === "rank";
  const rankColor: Record<string, string> = { silver: "#8B9DC3", gold: "#F59E0B", platinum: "#8B5CF6" };
  const typeLabel = room.id === "board-announcement" ? "お知らせ" : ["community-free-chat", "branch-kanto-free", "branch-kansai-free"].includes(room.id) ? "チャット" : room.type === "event" ? "イベント" : room.type === "board" ? "掲示板" : isDM ? "DM" : isGroup ? "友達グループ" : isRank ? (
    room.requiredRank === "platinum" ? "プラチナ" : room.requiredRank === "gold" ? "ゴールド" : "シルバー"
  ) : "部活動";
  const typeColor = room.type === "event" ? "#E8A0BF" : room.type === "board" ? "#A7C7E7" : isDM ? "#FF9500" : isGroup ? "#5B9BD5" : isRank ? (rankColor[room.requiredRank ?? "silver"] ?? "#8B9DC3") : "#34C759";
  const unreadCount = room.unreadCount ?? 0;
  const mentionCount = room.mentionCount ?? 0;
  const dmPartnerId = isDM ? room.participants.find((memberId) => memberId !== viewerMemberId) : undefined;
  const imageUri = room.type === "event" ? eventImages[room.sourceId] : dmPartnerId ? memberAvatars[dmPartnerId] ?? getDiscordAuthorById(dmPartnerId)?.avatarUrl ?? getDiscordAuthorByName(room.name)?.avatarUrl : undefined;
  const announcementIcon = room.id === "board-announcement";
  const displayName = room.type === "event" && eventStarts[room.sourceId]
    ? `${eventStarts[room.sourceId]} ${stripRankFromName(room.name)}`
    : stripRankFromName(room.name);
  const previewText = (() => {
    const text = (room.lastMessage ?? "").replace(/^【IRO\+\s*システム】\s*/, "");
    const joined = text.match(/^(.+?)がチャットに参加しました$/);
    return joined ? `${stripRankFromName(joined[1])}がチャットに参加しました` : text;
  })();

  const timeAgo = (dateStr?: string) => {
    if (!dateStr) return "";
    const hours = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3600000);
    if (hours < 1) return "たった今";
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  };

  return (
    <Pressable
      onPress={() => {
        if (longPressHandled.current) {
          longPressHandled.current = false;
          return;
        }
        const unreadCount = room.unreadCount ?? 0;
        onOpened(room.id, unreadCount);
        void markRoomRead(room.id);
        void Api.markSharedChatRoomRead(room.id).catch(() => {});
        router.push({ pathname: "/chat", params: { id: room.id, unreadCount: String(unreadCount), roomName: room.name, roomType: room.type, sourceId: room.sourceId, participants: room.participants.join(",") } });
      }}
      onLongPress={() => {
        if (!onLongPress) return;
        longPressHandled.current = true;
        onLongPress(room);
      }}
      delayLongPress={350}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 })}
    >
      {announcementIcon ? <Image source={require("@/assets/images/irotas-logo-square.png")} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: typeColor + "20" }} contentFit="cover" /> : imageUri ? <Image source={{ uri: imageUri }} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: typeColor + "20" }} contentFit="cover" /> : isDM ? <Image source={DEFAULT_AVATAR} style={{ width: 48, height: 48, borderRadius: 24 }} contentFit="cover" /> : (
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: typeColor + "20", alignItems: "center", justifyContent: "center" }}>
          <IconSymbol
            name={room.type === "event" ? "calendar" : room.type === "board" ? "bubble.left.and.bubble.right.fill" : isDM ? "message.fill" : isRank ? "crown.fill" : "person.3.fill"}
            size={22}
            color={typeColor}
          />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
          {pinned ? <IconSymbol name="pin.fill" size={14} color="#E8A0BF" style={{ marginRight: 4 }} /> : null}
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, flex: 1 }} numberOfLines={1}>{displayName}</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>{timeAgo(room.lastMessageAt)}</Text>
          {mentionCount > 0 ? <View style={{ minHeight: 22, borderRadius: 11, backgroundColor: "#ED4245", alignItems: "center", justifyContent: "center", paddingHorizontal: 8, marginLeft: 7 }}><Text style={{ fontSize: 10, fontWeight: "900", color: "#FFF" }}>@ メンション {Math.min(mentionCount, 99)}</Text></View> : unreadCount > 0 ? <View style={{ minHeight: 22, borderRadius: 11, backgroundColor: "#5865F2", alignItems: "center", justifyContent: "center", paddingHorizontal: 8, marginLeft: 7 }}><Text style={{ fontSize: 10, fontWeight: "900", color: "#FFF" }}>新着 {Math.min(unreadCount, 99)}</Text></View> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ backgroundColor: typeColor + "20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginRight: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: typeColor }}>{typeLabel}</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.muted, flex: 1 }} numberOfLines={1}>{previewText || "メッセージはまだありません"}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function CreateFriendGroupModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (room: ChatRoom) => void }) {
  const colors = useColors();
  const { user } = useAuthContext();
  const viewerMemberId = user?.memberId ?? (user?.id ? `member-${user.id}` : CURRENT_USER.id);
  const [members, setMembers] = useState<Api.PublicMember[]>([]);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const canCreate = name.trim().length > 0 && selectedIds.length >= 2;

  useEffect(() => {
    if (!visible) return;
    void Api.getMemberDirectory()
      .then((items) => setMembers(items.filter((item) => item.id !== viewerMemberId && item.isFriend)))
      .catch(() => setError("メンバー一覧を読み込めませんでした"));
  }, [viewerMemberId, visible]);

  const closeAndReset = () => {
    setName("");
    setSelectedIds([]);
    setError("");
    onClose();
  };

  const handleCreate = async () => {
    if (!canCreate || saving) return;
    setSaving(true);
    try {
      const room = await Api.createSharedChatRoom({ type: "group", name, memberIds: selectedIds });
      closeAndReset();
      onCreated(room as unknown as ChatRoom);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "グループを作成できませんでした");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeAndReset}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <Pressable onPress={closeAndReset}><Text style={{ fontSize: 15, color: colors.muted }}>キャンセル</Text></Pressable>
          <Text style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: colors.foreground }}>友達とグループ作成</Text>
          <Pressable onPress={() => void handleCreate()} disabled={!canCreate || saving}><Text style={{ fontSize: 15, fontWeight: "800", color: canCreate && !saving ? "#E8A0BF" : colors.border }}>{saving ? "作成中" : "作成"}</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 7 }}>グループ名</Text>
          <TextInput
            value={name}
            onChangeText={(value) => { setName(value); setError(""); }}
            placeholder="例：週末グルメ会"
            placeholderTextColor={colors.muted}
            style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border }}
          />
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 20 }}>招待するメンバー</Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 4, marginBottom: 8 }}>相互フォローの友達から2人以上選択してください。作成後も友達を追加・削除できます。</Text>
          {members.map((friend) => {
            const selected = selectedIds.includes(friend.id);
            return (
              <Pressable
                key={friend.id}
                onPress={() => { setSelectedIds((current) => selected ? current.filter((id) => id !== friend.id) : [...current, friend.id]); setError(""); }}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
              >
                <Image source={DEFAULT_AVATAR} style={{ width: 42, height: 42, borderRadius: 21 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 11 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{friend.displayName}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{friend.memberTerm ?? "期生未設定"}</Text>
                </View>
                <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: selected ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: selected ? "#E8A0BF" : colors.border }}>
                  {selected ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}
                </View>
              </Pressable>
            );
          })}
          {!members.length && !error ? <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 30 }}>相互フォローの友達がまだいません。メンバープロフィールからお互いにフォローすると表示されます。</Text> : null}
          {error ? <Text style={{ fontSize: 13, color: colors.error, marginTop: 12 }}>{error}</Text> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function ChatListScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const viewerMemberId = authUser?.memberId ?? (authUser?.id ? `member-${authUser.id}` : CURRENT_USER.id);
  const activeViewerId = useRef(viewerMemberId);
  activeViewerId.current = viewerMemberId;
  const viewerRank = authUser?.memberRank ?? CURRENT_USER.rank;
  const canViewAllChats = isOperatorRole(authUser?.role, authUser?.accessRole);
  const viewerBranches = authUser?.branches ?? [authUser?.branch ?? CURRENT_USER.branch];
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [myRooms, setMyRooms] = useState<ChatRoom[]>(() =>
    (lastRoomLists.get(viewerMemberId)?.joined ?? []).filter((room) => room.type !== "dm" || room.participants.includes(viewerMemberId)),
  );
  const [rankRooms, setRankRooms] = useState<ChatRoom[]>(() => lastRoomLists.get(viewerMemberId)?.rank ?? []);
  const [eventStarts, setEventStarts] = useState<Record<string, string>>({});
  const [eventImages, setEventImages] = useState<Record<string, string>>({});
  const [memberAvatars, setMemberAvatars] = useState<Record<string, string>>({});
  const [roomsLoading, setRoomsLoading] = useState(() => !lastRoomLists.has(viewerMemberId));
  const [announcementPreviewReady, setAnnouncementPreviewReady] = useState(() =>
    Boolean(lastRoomLists.get(viewerMemberId)?.joined.find((room) => room.id === "board-announcement")?.lastMessage),
  );
  const [chatListPreferences, setChatListPreferences] = useState<ChatListPreferences>({ pinnedRoomIds: [], hiddenRoomIds: [] });
  const [actionRoom, setActionRoom] = useState<ChatRoom | null>(null);
  useEffect(() => {
    const saved = lastRoomLists.get(viewerMemberId);
    setMyRooms(saved?.joined ?? []);
    setRankRooms(saved?.rank ?? []);
    setRoomsLoading(!saved);
    setAnnouncementPreviewReady(Boolean(saved?.joined.find((room) => room.id === "board-announcement")?.lastMessage));
    let active = true;
    void loadChatListPreferences(viewerMemberId).then((preferences) => { if (active) setChatListPreferences(preferences); });
    return () => { active = false; };
  }, [viewerMemberId]);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    const onDismissed = (event: Event) => {
      const detail = (event as CustomEvent<{ memberId: string; roomId: string }>).detail;
      if (detail?.memberId !== viewerMemberId) return;
      setMyRooms((rooms) => rooms.filter((room) => room.id !== detail.roomId));
      setRankRooms((rooms) => rooms.filter((room) => room.id !== detail.roomId));
    };
    window.addEventListener("irotas-chat-dismissed", onDismissed);
    return () => window.removeEventListener("irotas-chat-dismissed", onDismissed);
  }, [viewerMemberId]);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    const onSent = (event: Event) => {
      const detail = (event as CustomEvent<{ memberId: string; roomId: string; preview: SentChatPreview }>).detail;
      if (detail?.memberId !== viewerMemberId) return;
      const update = (rooms: ChatRoom[]) => sortRoomsByRecent(rooms.map((room) => room.id === detail.roomId
        ? mergeSentChatPreview(room, detail.preview) : room));
      setMyRooms(update);
      setRankRooms(update);
    };
    window.addEventListener("irotas-chat-message-sent", onSent);
    return () => window.removeEventListener("irotas-chat-message-sent", onSent);
  }, [viewerMemberId]);
  const clearUnreadImmediately = useCallback((roomId: string, unreadCount: number) => {
    markChatRoomOptimisticallyRead(roomId, unreadCount);
    const clear = (rooms: ChatRoom[]) => rooms.map((room) => room.id === roomId ? { ...room, unreadCount: 0, mentionCount: 0 } : room);
    setMyRooms(clear);
    setRankRooms(clear);
  }, []);

  const updateChatListPreferences = useCallback((update: (current: ChatListPreferences) => ChatListPreferences) => {
    setChatListPreferences((current) => {
      const next = update(current);
      void AsyncStorage.setItem(chatListPreferencesKey(viewerMemberId), JSON.stringify(next));
      return next;
    });
  }, [viewerMemberId]);

  const openRoomActions = useCallback((room: ChatRoom) => {
    setActionRoom(room);
  }, []);

  const refreshRooms = useCallback(async (includeDetails = true) => {
    const refreshStartedAt = Date.now();
    if (includeDetails && !lastRoomLists.has(viewerMemberId)) setRoomsLoading(true);
    // 旧プロトタイプ用の chat1〜chat4 は、保存済みの実際の会話ではないため一覧に出さない。
    const isFixtureRoom = (room: ChatRoom) => /^chat\d+$/.test(room.id);
    const branchRooms = CHAT_ROOMS.filter((room) => room.sourceId === "branch-kanto" ? viewerBranches.includes("kanto") : room.sourceId === "branch-kansai" ? viewerBranches.includes("kansai") : false);
    const localJoinedRooms = [...getMyRooms(viewerMemberId), ...branchRooms]
      .filter((room) => room.type !== "rank" && room.type !== "club" && (room.type !== "dm" || room.participants.includes(viewerMemberId)) && !isFixtureRoom(room) && !isImportedEventChat(room) && !dismissedRooms.get(viewerMemberId)?.has(room.id));
    const localRankRooms = getRankRoomsForUser(viewerRank, canViewAllChats);
    // Do not present the local subset as a complete list while shared rooms load.
    let sharedRooms: ChatRoom[] = [];
    try {
      // 一覧表示に必要なのはルーム一覧だけ。重い補助情報は後段で補完する。
      const rooms = await Api.getSharedChatRooms();
      // A room returned by a fresh request after departure is a new invitation.
      for (const room of rooms) {
        const key = `${viewerMemberId}:${room.id}`;
        if (refreshStartedAt > (dismissedAt.get(key) ?? Infinity)) {
          dismissedRooms.get(viewerMemberId)?.delete(room.id);
          dismissedAt.delete(key);
        }
      }
      sharedRooms = rooms.map((room) => ({ ...room, requiredRank: room.requiredRank as ChatRoom["requiredRank"] }))
        .filter((room) => !isImportedEventChat(room) && (room.type !== "dm" || room.participants.includes(viewerMemberId)));
      if (includeDetails) {
        // The room list already carries the authoritative latest-message preview.
        // Keep secondary event/avatar decoration off the first-render critical path.
        if (activeViewerId.current === viewerMemberId) setAnnouncementPreviewReady(true);
        void Promise.all([
          Api.getEvents().catch(() => []),
          Api.getMemberDirectory().catch(() => []),
        ]).then(([events, members]) => {
          setEventStarts(Object.fromEntries(events.map((event) => [event.id, formatEventStart(event)])));
          setEventImages(Object.fromEntries(events.flatMap((event) => typeof event.image === "string" && event.image ? [[event.id, event.image]] : [])));
          setMemberAvatars(Object.fromEntries(members.flatMap((member) => {
            const avatar = member.profile.avatarUrl;
            return typeof avatar === "string" && avatar ? [[member.id, avatar]] : [];
          })));
        });
      }
    } catch {
      // オフライン時も端末内の移行済みチャット一覧は利用できる。
    }
    const sharedById = new Map(sharedRooms.map((room) => [room.id, room]));
    const cachedAnnouncement = lastRoomLists.get(viewerMemberId)?.joined.find((room) => room.id === "board-announcement");
    const mergedJoined = [...localJoinedRooms.filter((room) => !sharedById.has(room.id)), ...sharedRooms.filter((room) => room.type !== "rank" && !isFixtureRoom(room))]
      .filter((room) => !dismissedRooms.get(viewerMemberId)?.has(room.id))
      .filter((room, index, all) => all.findIndex((candidate) => candidate.id === room.id) === index)
      .map((room) => room.id === "board-announcement" && !room.lastMessage && cachedAnnouncement?.lastMessage
          ? { ...room, lastMessage: cachedAnnouncement.lastMessage, lastMessageAt: cachedAnnouncement.lastMessageAt }
          : room);
    const mergedRank = viewerRank === "regular" && !canViewAllChats ? [] : [
      ...localRankRooms.filter((room) => !sharedById.has(room.id)),
      ...sharedRooms.filter((room) => room.type === "rank" && (canViewAllChats || canAccessRankRoom(viewerRank, room.requiredRank))),
    ];
    const [sortedJoined, sortedRank] = await Promise.all([applyReadRoomState(mergedJoined), applyReadRoomState(mergedRank)]);
    if (activeViewerId.current !== viewerMemberId) return;
    const currentJoined = sortRoomsByRecent(sortedJoined.map((room) => withRecentlySentPreview(viewerMemberId, room)));
    const currentRank = sortRoomsByRecent(sortedRank.map((room) => withRecentlySentPreview(viewerMemberId, room)));
    setMyRooms(currentJoined);
    setRankRooms(currentRank);
    lastRoomLists.set(viewerMemberId, { joined: currentJoined, rank: currentRank });
    setRoomsLoading(false);
  }, [canViewAllChats, viewerBranches, viewerMemberId, viewerRank]);

  useFocusEffect(useCallback(() => {
    let active = true;
    let pending = true;
    void refreshRooms().finally(() => { pending = false; });
    void loadDynamicRooms();
    const refresh = () => {
      if (!active || pending) return;
      pending = true;
      void refreshRooms(false).finally(() => { pending = false; });
    };
    const timer = setInterval(refresh, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    const appStateSubscription = Platform.OS === "web" ? null : AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => { active = false; clearInterval(timer); appStateSubscription?.remove(); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible); };
  }, [refreshRooms]));

  const visibleRoom = (room: ChatRoom) => !chatListPreferences.hiddenRoomIds.includes(room.id);
  const pinOrder = (room: ChatRoom) => {
    const index = chatListPreferences.pinnedRoomIds.indexOf(room.id);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const isPinned = (room: ChatRoom) => chatListPreferences.pinnedRoomIds.includes(room.id);
  const announcementRoom = myRooms.find((room) => room.id === "board-announcement" && visibleRoom(room));
  // 自己紹介は掲示板から開く導線に統一し、通常のチャット一覧には表示しない。
  const allJoinedChatRooms = myRooms
    .filter((room) => room.id !== "board-announcement" && room.id !== "board-introduction" && visibleRoom(room));
  const allVisibleRankRooms = rankRooms.filter(visibleRoom);
  const pinnedRooms = [...allJoinedChatRooms, ...allVisibleRankRooms]
    .filter((room, index, rooms) => isPinned(room) && rooms.findIndex((candidate) => candidate.id === room.id) === index)
    .sort((left, right) => pinOrder(left) - pinOrder(right));
  const joinedChatRooms = allJoinedChatRooms.filter((room) => !isPinned(room));
  const visibleRankRooms = allVisibleRankRooms.filter((room) => !isPinned(room));

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>チャット</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setShowCreateGroup(true)} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#E8A0BF18", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}>
          <IconSymbol name="person.badge.plus" size={17} color="#E8A0BF" />
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#E8A0BF", marginLeft: 5 }}>グループ作成</Text>
        </Pressable>
      </View>

      {announcementRoom && (announcementRoom.lastMessage || announcementPreviewReady) ? <ChatRoomCard room={announcementRoom} eventStarts={eventStarts} eventImages={eventImages} memberAvatars={memberAvatars} viewerMemberId={viewerMemberId} onOpened={clearUnreadImmediately} /> : null}
      <FlatList
        data={joinedChatRooms}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatRoomCard room={item} eventStarts={eventStarts} eventImages={eventImages} memberAvatars={memberAvatars} viewerMemberId={viewerMemberId} onOpened={clearUnreadImmediately} onLongPress={openRoomActions} pinned={isPinned(item)} />}
        ListHeaderComponent={<>{pinnedRooms.length > 0 ? <View><View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}><Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 }}>ピン留め</Text></View>{pinnedRooms.map((room) => <ChatRoomCard key={room.id} room={room} eventStarts={eventStarts} eventImages={eventImages} memberAvatars={memberAvatars} viewerMemberId={viewerMemberId} onOpened={clearUnreadImmediately} onLongPress={openRoomActions} pinned />)}</View> : null}{visibleRankRooms.length > 0 ? <View><View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}><Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 }}>あなたのランク以下のチャット</Text></View>{visibleRankRooms.map((room) => <ChatRoomCard key={room.id} room={room} eventStarts={eventStarts} eventImages={eventImages} memberAvatars={memberAvatars} viewerMemberId={viewerMemberId} onOpened={clearUnreadImmediately} onLongPress={openRoomActions} />)}</View> : null}{joinedChatRooms.length > 0 ? <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}><Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 }}>参加中のチャット</Text></View> : null}</>}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 112, flexGrow: 1 }}
        ListEmptyComponent={pinnedRooms.length || visibleRankRooms.length ? null : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80 }}><Text style={{ fontSize: 14, color: colors.muted }}>{roomsLoading ? "読み込み中…" : "参加中のチャットはありません"}</Text></View>}
      />
      <Modal visible={actionRoom !== null} transparent animationType="slide" onRequestClose={() => setActionRoom(null)}>
        <Pressable onPress={() => setActionRoom(null)} style={{ flex: 1, backgroundColor: "rgba(20,18,24,0.42)", justifyContent: "flex-end" }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 34 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "900", color: colors.foreground, marginBottom: 10 }}>{actionRoom?.name}</Text>
            <Pressable onPress={() => {
              if (!actionRoom) return;
              const pinned = chatListPreferences.pinnedRoomIds.includes(actionRoom.id);
              updateChatListPreferences((current) => ({
                ...current,
                pinnedRoomIds: pinned ? current.pinnedRoomIds.filter((id) => id !== actionRoom.id) : [actionRoom.id, ...current.pinnedRoomIds.filter((id) => id !== actionRoom.id)],
              }));
              setActionRoom(null);
            }} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
              <IconSymbol name="pin.fill" size={19} color={colors.foreground} />
              <Text style={{ marginLeft: 12, fontSize: 15, fontWeight: "800", color: colors.foreground }}>{actionRoom && chatListPreferences.pinnedRoomIds.includes(actionRoom.id) ? "ピン留めを解除" : "チャットをピン留め"}</Text>
            </Pressable>
            <Pressable onPress={() => {
              if (!actionRoom) return;
              const room = actionRoom;
              setActionRoom(null);
              Alert.alert("チャットを削除", "この端末のチャット一覧から削除します。", [
                { text: "キャンセル", style: "cancel" },
                { text: "削除", style: "destructive", onPress: () => updateChatListPreferences((current) => ({
                  pinnedRoomIds: current.pinnedRoomIds.filter((id) => id !== room.id),
                  hiddenRoomIds: [room.id, ...current.hiddenRoomIds.filter((id) => id !== room.id)],
                })) },
              ]);
            }} style={{ minHeight: 56, flexDirection: "row", alignItems: "center" }}>
              <IconSymbol name="trash.fill" size={19} color="#D94C55" />
              <Text style={{ marginLeft: 12, fontSize: 15, fontWeight: "800", color: "#D94C55" }}>削除</Text>
            </Pressable>
            <Pressable onPress={() => setActionRoom(null)} style={{ marginTop: 8, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.surface }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>キャンセル</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <CreateFriendGroupModal visible={showCreateGroup} onClose={() => setShowCreateGroup(false)} onCreated={(room) => { void refreshRooms(); router.push({ pathname: "/chat", params: { id: room.id } }); }} />
    </ScreenContainer>
  );
}
