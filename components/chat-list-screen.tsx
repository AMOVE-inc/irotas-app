import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, type ChatRoom } from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { applyReadRoomState, createFriendGroupChat, getAllRooms, getMyRooms, getRankRoomsForUser, loadDynamicRooms, markRoomRead } from "@/lib/chat-store";
import { getFriends } from "@/lib/friendship";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

function ChatRoomCard({ room }: { room: ChatRoom }) {
  const colors = useColors();
  const router = useRouter();
  const isDM = room.type === "dm";
  const isGroup = room.type === "group";
  const isRank = room.type === "rank";
  const rankColor: Record<string, string> = { silver: "#8B9DC3", gold: "#F59E0B", platinum: "#8B5CF6" };
  const typeLabel = room.type === "event" ? "イベント" : room.type === "board" ? "掲示板" : isDM ? "DM" : isGroup ? "友達グループ" : isRank ? (
    room.requiredRank === "platinum" ? "プラチナ" : room.requiredRank === "gold" ? "ゴールド" : "シルバー"
  ) : "部活動";
  const typeColor = room.type === "event" ? "#E8A0BF" : room.type === "board" ? "#A7C7E7" : isDM ? "#FF9500" : isGroup ? "#5B9BD5" : isRank ? (rankColor[room.requiredRank ?? "silver"] ?? "#8B9DC3") : "#34C759";

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
        void markRoomRead(room.id);
        router.push({ pathname: "/chat", params: { id: room.id, unreadCount: String(unreadCount) } });
      }}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: typeColor + "20", alignItems: "center", justifyContent: "center" }}>
        <IconSymbol
          name={room.type === "event" ? "calendar" : room.type === "board" ? "bubble.left.and.bubble.right.fill" : isDM ? "message.fill" : isRank ? "crown.fill" : "person.3.fill"}
          size={22}
          color={typeColor}
        />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, flex: 1 }} numberOfLines={1}>{room.name}</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>{timeAgo(room.lastMessageAt)}</Text>
          {(room.unreadCount ?? 0) > 0 ? <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#FF3B30", alignItems: "center", justifyContent: "center", paddingHorizontal: 6, marginLeft: 7 }}><Text style={{ fontSize: 11, fontWeight: "900", color: "#FFF" }}>{Math.min(room.unreadCount ?? 0, 99)}</Text></View> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ backgroundColor: typeColor + "20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginRight: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: typeColor }}>{typeLabel}</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.muted, flex: 1 }} numberOfLines={1}>{room.lastMessage || "メッセージはまだありません"}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function CreateFriendGroupModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (room: ChatRoom) => void }) {
  const colors = useColors();
  const friends = getFriends(CURRENT_USER.id);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const canCreate = name.trim().length > 0 && selectedIds.length >= 2;

  const closeAndReset = () => {
    setName("");
    setSelectedIds([]);
    setError("");
    onClose();
  };

  const handleCreate = () => {
    if (!canCreate) return;
    try {
      const room = createFriendGroupChat(name, selectedIds, CURRENT_USER.id);
      closeAndReset();
      onCreated(room);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "グループを作成できませんでした");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeAndReset}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <Pressable onPress={closeAndReset}><Text style={{ fontSize: 15, color: colors.muted }}>キャンセル</Text></Pressable>
          <Text style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: colors.foreground }}>友達とグループ作成</Text>
          <Pressable onPress={handleCreate} disabled={!canCreate}><Text style={{ fontSize: 15, fontWeight: "800", color: canCreate ? "#E8A0BF" : colors.border }}>作成</Text></Pressable>
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
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 20 }}>招待する友達</Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 4, marginBottom: 8 }}>自分と相互に友達のメンバーだけを招待できます。2人以上選択してください。</Text>
          {friends.map((friend) => {
            const selected = selectedIds.includes(friend.id);
            return (
              <Pressable
                key={friend.id}
                onPress={() => { setSelectedIds((current) => selected ? current.filter((id) => id !== friend.id) : [...current, friend.id]); setError(""); }}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
              >
                <Image source={friend.avatar} style={{ width: 42, height: 42, borderRadius: 21 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 11 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{friend.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{friend.generation}期生・{friend.branch === "kanto" ? "関東" : "関西"}支部</Text>
                </View>
                <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: selected ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: selected ? "#E8A0BF" : colors.border }}>
                  {selected ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}
                </View>
              </Pressable>
            );
          })}
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
  const userIsAdmin = authUser?.role === "admin";
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [myRooms, setMyRooms] = useState<ChatRoom[]>([]);
  const [rankRooms, setRankRooms] = useState<ChatRoom[]>([]);

  const refreshRooms = useCallback(async () => {
    const joinedRooms = userIsAdmin ? getAllRooms().filter((room) => room.type !== "rank") : getMyRooms(CURRENT_USER.id).filter((room) => room.type !== "rank");
    const [sortedJoined, sortedRank] = await Promise.all([applyReadRoomState(joinedRooms), applyReadRoomState(getRankRoomsForUser(CURRENT_USER.rank))]);
    setMyRooms(sortedJoined);
    setRankRooms(sortedRank);
  }, [userIsAdmin]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadDynamicRooms().then(() => { if (active) void refreshRooms(); });
    return () => { active = false; };
  }, [refreshRooms]));

  const announcementRoom = myRooms.find((room) => room.id === "board-announcement");
  const joinedChatRooms = myRooms.filter((room) => room.id !== "board-announcement");

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()}><IconSymbol name="arrow.left" size={22} color={colors.foreground} /></Pressable>
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, marginLeft: 12 }}>チャット</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setShowCreateGroup(true)} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#E8A0BF18", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}>
          <IconSymbol name="person.badge.plus" size={17} color="#E8A0BF" />
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#E8A0BF", marginLeft: 5 }}>グループ作成</Text>
        </Pressable>
      </View>

      {announcementRoom ? <ChatRoomCard room={announcementRoom} /> : null}
      {rankRooms.length > 0 ? (
        <View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}><Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 }}>あなたのランク専用チャット</Text></View>
          {rankRooms.map((room) => <ChatRoomCard key={room.id} room={room} />)}
        </View>
      ) : null}
      {joinedChatRooms.length > 0 ? <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}><Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 }}>参加中のチャット</Text></View> : null}
      <FlatList
        data={joinedChatRooms}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatRoomCard room={item} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<View style={{ alignItems: "center", paddingVertical: 60, paddingHorizontal: 24 }}><IconSymbol name="message.fill" size={48} color={colors.border} /><Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginTop: 16 }}>参加中のチャットはありません</Text><Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: "center", lineHeight: 20 }}>イベントや部活動に参加するか、友達を招待してグループを作成できます</Text></View>}
      />
      <CreateFriendGroupModal visible={showCreateGroup} onClose={() => setShowCreateGroup(false)} onCreated={(room) => { void refreshRooms(); router.push({ pathname: "/chat", params: { id: room.id } }); }} />
    </ScreenContainer>
  );
}
