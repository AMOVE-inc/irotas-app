import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CHAT_ROOMS, CURRENT_USER, DEFAULT_AVATAR, type ChatRoom } from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { applyReadRoomState, getAllMessages, getMyRooms, getRankRoomsForUser, loadDynamicRooms, markRoomRead } from "@/lib/chat-store";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Api from "@/lib/_core/api";
import { stripRankFromName } from "@/components/member-rank-badge";
import { getDiscordAuthorById, getDiscordAuthorByName } from "@/lib/discord-author-directory";

function formatEventStart(event: { date: string; time: string }) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.date);
  if (!match) return [event.date, event.time].filter(Boolean).join(" ");
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay();
  return `${Number(match[2])}/${Number(match[3])}(${["日", "月", "火", "水", "木", "金", "土"][day]})${event.time ? ` ${event.time}` : ""}`;
}

function ChatRoomCard({ room, eventStarts, eventImages, memberAvatars, viewerMemberId, onOpened }: {
  room: ChatRoom;
  eventStarts: Record<string, string>;
  eventImages: Record<string, string>;
  memberAvatars: Record<string, string>;
  viewerMemberId: string;
  onOpened: (roomId: string) => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const isDM = room.type === "dm";
  const isGroup = room.type === "group";
  const isRank = room.type === "rank";
  const rankColor: Record<string, string> = { silver: "#8B9DC3", gold: "#F59E0B", platinum: "#8B5CF6" };
  const typeLabel = room.id === "board-announcement" ? "お知らせ" : room.type === "event" ? "イベント" : room.type === "board" ? "掲示板" : isDM ? "DM" : isGroup ? "友達グループ" : isRank ? (
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
        const unreadCount = room.unreadCount ?? 0;
        onOpened(room.id);
        void markRoomRead(room.id);
        void Api.markSharedChatRoomRead(room.id).catch(() => {});
        router.push({ pathname: "/chat", params: { id: room.id, unreadCount: String(unreadCount) } });
      }}
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
  const viewerRank = authUser?.memberRank ?? CURRENT_USER.rank;
  const viewerBranches = authUser?.branches ?? [authUser?.branch ?? CURRENT_USER.branch];
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [myRooms, setMyRooms] = useState<ChatRoom[]>([]);
  const [rankRooms, setRankRooms] = useState<ChatRoom[]>([]);
  const [eventStarts, setEventStarts] = useState<Record<string, string>>({});
  const [eventImages, setEventImages] = useState<Record<string, string>>({});
  const [memberAvatars, setMemberAvatars] = useState<Record<string, string>>({});
  const [roomsLoading, setRoomsLoading] = useState(true);
  const clearUnreadImmediately = useCallback((roomId: string) => {
    const clear = (rooms: ChatRoom[]) => rooms.map((room) => room.id === roomId ? { ...room, unreadCount: 0, mentionCount: 0 } : room);
    setMyRooms(clear);
    setRankRooms(clear);
  }, []);

  const refreshRooms = useCallback(async () => {
    setRoomsLoading(true);
    // 旧プロトタイプ用の chat1〜chat4 は、保存済みの実際の会話ではないため一覧に出さない。
    const isFixtureRoom = (room: ChatRoom) => /^chat\d+$/.test(room.id);
    const branchRooms = CHAT_ROOMS.filter((room) => room.sourceId === "branch-kanto" ? viewerBranches.includes("kanto") : room.sourceId === "branch-kansai" ? viewerBranches.includes("kansai") : false);
    const localJoinedRooms = [...getMyRooms(viewerMemberId), ...branchRooms]
      .filter((room) => room.type !== "rank" && !isFixtureRoom(room));
    const localRankRooms = getRankRoomsForUser(viewerRank);
    let sharedRooms: ChatRoom[] = [];
    try {
      // 一覧表示に必要なのはルーム一覧だけ。重い補助情報は後段で補完する。
      const rooms = await Api.getSharedChatRooms();
      sharedRooms = rooms.map((room) => ({ ...room, requiredRank: room.requiredRank as ChatRoom["requiredRank"] }));
      void Promise.all([
        Api.getEvents().catch(() => []),
        Api.getMemberDirectory().catch(() => []),
        Api.getSharedChatMessages("board-announcement").catch(() => []),
      ]).then(([events, members, announcementMessages]) => {
        const latestAnnouncement = announcementMessages.at(-1);
        if (latestAnnouncement) setMyRooms((current) => current.map((room) => room.id === "board-announcement"
          ? { ...room, lastMessage: latestAnnouncement.content.replace(/^【IRO\+\s*システム】\s*/, "").replace(/\s+/g, " ").trim(), lastMessageAt: latestAnnouncement.createdAt }
          : room));
        setEventStarts(Object.fromEntries(events.map((event) => [event.id, formatEventStart(event)])));
        setEventImages(Object.fromEntries(events.flatMap((event) => typeof event.image === "string" && event.image ? [[event.id, event.image]] : [])));
        setMemberAvatars(Object.fromEntries(members.flatMap((member) => {
          const avatar = member.profile.avatarUrl;
          return typeof avatar === "string" && avatar ? [[member.id, avatar]] : [];
        })));
      });
    } catch {
      // オフライン時も端末内の移行済みチャット一覧は利用できる。
    }
    const sharedById = new Map(sharedRooms.map((room) => [room.id, room]));
    const localAnnouncement = getAllMessages().filter((message) => message.chatId === "board-announcement").at(-1);
    const announcementPreview = localAnnouncement;
    const mergedJoined = [...localJoinedRooms.filter((room) => !sharedById.has(room.id)), ...sharedRooms.filter((room) => room.type !== "rank" && !isFixtureRoom(room))]
      .filter((room, index, all) => all.findIndex((candidate) => candidate.id === room.id) === index)
      .map((room) => room.id === "board-announcement" && announcementPreview
        ? { ...room, lastMessage: announcementPreview.content.replace(/^【IRO\+\s*システム】\s*/, "").replace(/\s+/g, " ").trim(), lastMessageAt: announcementPreview.createdAt }
        : room);
    const mergedRank = viewerRank === "regular" ? [] : [
      ...localRankRooms.filter((room) => !sharedById.has(room.id)),
      ...sharedRooms.filter((room) => room.type === "rank" && room.requiredRank === viewerRank),
    ];
    const [sortedJoined, sortedRank] = await Promise.all([applyReadRoomState(mergedJoined), applyReadRoomState(mergedRank)]);
    setMyRooms(sortedJoined);
    setRankRooms(sortedRank);
    setRoomsLoading(false);
  }, [viewerBranches, viewerMemberId, viewerRank]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadDynamicRooms().then(() => { if (active) void refreshRooms(); });
    return () => { active = false; };
  }, [refreshRooms]));

  const announcementRoom = myRooms.find((room) => room.id === "board-announcement");
  const joinedChatRooms = myRooms.filter((room) => room.id !== "board-announcement");

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

      {announcementRoom ? <ChatRoomCard room={announcementRoom} eventStarts={eventStarts} eventImages={eventImages} memberAvatars={memberAvatars} viewerMemberId={viewerMemberId} onOpened={clearUnreadImmediately} /> : null}
      <FlatList
        data={joinedChatRooms}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatRoomCard room={item} eventStarts={eventStarts} eventImages={eventImages} memberAvatars={memberAvatars} viewerMemberId={viewerMemberId} onOpened={clearUnreadImmediately} />}
        ListHeaderComponent={<>{rankRooms.length > 0 ? <View><View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}><Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 }}>あなたのランク専用チャット</Text></View>{rankRooms.map((room) => <ChatRoomCard key={room.id} room={room} eventStarts={eventStarts} eventImages={eventImages} memberAvatars={memberAvatars} viewerMemberId={viewerMemberId} onOpened={clearUnreadImmediately} />)}</View> : null}{joinedChatRooms.length > 0 ? <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}><Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 }}>参加中のチャット</Text></View> : null}</>}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 112, flexGrow: 1 }}
        ListEmptyComponent={<View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80 }}><Text style={{ fontSize: 14, color: colors.muted }}>{roomsLoading ? "読み込み中…" : "参加中のチャットはありません"}</Text></View>}
      />
      <CreateFriendGroupModal visible={showCreateGroup} onClose={() => setShowCreateGroup(false)} onCreated={(room) => { void refreshRooms(); router.push({ pathname: "/chat", params: { id: room.id } }); }} />
    </ScreenContainer>
  );
}
