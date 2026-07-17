import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  CURRENT_USER,
  isAdmin,
  type ChatRoom,
} from "@/constants/mock-data";
import { getMyRooms, getRankRoomsForUser, getAllRooms } from "@/lib/chat-store";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";

const userIsAdmin = isAdmin(CURRENT_USER);

function ChatRoomCard({ room }: { room: ChatRoom }) {
  const colors = useColors();
  const router = useRouter();

  const isDM = (room.type as string) === "dm";
  const isRank = room.type === "rank";
  const rankColor: Record<string, string> = { regular: "#9BA1A6", silver: "#8B9DC3", gold: "#F59E0B", platinum: "#8B5CF6" };
  const typeLabel = room.type === "event" ? "イベント" : room.type === "board" ? "掲示板" : isDM ? "DM" : isRank ? (
    room.requiredRank === "platinum" ? "プラチナ" :
    room.requiredRank === "gold" ? "ゴールド" :
    room.requiredRank === "silver" ? "シルバー" : "レギュラー"
  ) : "部活動";
  const typeColor = room.type === "event" ? "#E8A0BF" : room.type === "board" ? "#A7C7E7" : isDM ? "#FF9500" : isRank ? (rankColor[room.requiredRank ?? "regular"] ?? "#9BA1A6") : "#34C759";

  const timeAgo = (dateStr?: string) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "たった今";
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    return `${days}日前`;
  };

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/chat", params: { id: room.id } })}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: typeColor + "20",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconSymbol
          name={room.type === "event" ? "calendar" : room.type === "board" ? "bubble.left.and.bubble.right.fill" : isDM ? "message.fill" : isRank ? "crown.fill" : "person.3.fill"}
          size={22}
          color={typeColor}
        />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, flex: 1 }} numberOfLines={1}>
            {room.name}
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>
            {timeAgo(room.lastMessageAt)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              backgroundColor: typeColor + "20",
              borderRadius: 6,
              paddingHorizontal: 6,
              paddingVertical: 1,
              marginRight: 6,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "600", color: typeColor }}>
              {typeLabel}
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.muted, flex: 1 }} numberOfLines={1}>
            {room.lastMessage || "メッセージはまだありません"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function ChatListScreen() {
  const colors = useColors();
  const router = useRouter();
  const [myRooms, setMyRooms] = useState<ChatRoom[]>(() =>
    userIsAdmin
      ? getAllRooms().filter((r) => r.type !== "rank")
      : getMyRooms(CURRENT_USER.id).filter((r) => r.type !== "rank"),
  );
  const [rankRooms, setRankRooms] = useState<ChatRoom[]>(() =>
    getRankRoomsForUser(CURRENT_USER.rank),
  );

  // 画面にフォーカスが当たるたびに最新のルーム一覧を取得
  useFocusEffect(
    useCallback(() => {
      setMyRooms(
        userIsAdmin
          ? getAllRooms().filter((r) => r.type !== "rank")
          : getMyRooms(CURRENT_USER.id).filter((r) => r.type !== "rank")
      );
      setRankRooms(getRankRoomsForUser(CURRENT_USER.rank));
    }, []),
  );

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, marginLeft: 12 }}>
          チャット
        </Text>
        <View style={{ flex: 1 }} />
        <View
          style={{
            backgroundColor: userIsAdmin ? "#E8A0BF20" : colors.surface,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontSize: 12, color: userIsAdmin ? "#E8A0BF" : colors.muted }}>
            {userIsAdmin ? `全て ${myRooms.length}件` : `${myRooms.length}件`}
          </Text>
        </View>
      </View>

      {/* ランク別チャットセクション */}
      {rankRooms.length > 0 && (
        <View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 }}>
              ランク別チャット
            </Text>
          </View>
          {rankRooms.map((room) => (
            <ChatRoomCard key={room.id} room={room} />
          ))}
        </View>
      )}

      {/* 通常チャットセクション */}
      {myRooms.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 }}>
            チャット
          </Text>
        </View>
      )}
      <FlatList
        data={myRooms}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatRoomCard room={item} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 60, paddingHorizontal: 24 }}>
            <IconSymbol name="message.fill" size={48} color={colors.border} />
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginTop: 16 }}>
              チャットはまだありません
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: "center", lineHeight: 20 }}>
              イベントに参加、掲示板の参加者確定、またはメンバープロフィールからDMを送るとチャットが表示されます
            </Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}
