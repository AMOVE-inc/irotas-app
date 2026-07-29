import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { FlatList, Platform, Pressable, Text, View } from "react-native";
import { CURRENT_USER } from "@/constants/mock-data";
import { useInAppNotifications } from "@/lib/in-app-notifications-store";

interface Notification {
  id: string;
  type: "event" | "announcement" | "like" | "comment" | "coupon" | "club_application" | "club_approval" | "event_confirmed" | "event_deadline" | "event_reminder";
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const NOTIFICATIONS: Notification[] = [
  {
    id: "club-application-sample",
    type: "club_application",
    title: "ラーメン部に入部申請が届きました",
    body: "りょうさんの申請内容とイベント参加履歴を確認してください",
    time: "30分前",
    read: false,
  },
  {
    id: "n1",
    type: "announcement",
    title: "IRO＋ 2周年記念イベント開催決定！",
    body: "2026年4月に2周年記念パーティーを開催します",
    time: "3時間前",
    read: false,
  },
  {
    id: "n2",
    type: "like",
    title: "さくらさんがいいねしました",
    body: "あなたの投稿「昨日行った渋谷の焼肉屋さんが...」",
    time: "5時間前",
    read: false,
  },
  {
    id: "n3",
    type: "event",
    title: "第3回 関東支部交流会",
    body: "イベントの参加受付が開始されました",
    time: "1日前",
    read: true,
  },
  {
    id: "n4",
    type: "comment",
    title: "たくみさんがコメントしました",
    body: "「渋谷でおすすめの焼肉屋さん教えてください！」に返信",
    time: "1日前",
    read: true,
  },
  {
    id: "n5",
    type: "coupon",
    title: "新しいクーポンが届きました",
    body: "焼肉 罪と罰 10%OFFクーポン",
    time: "2日前",
    read: true,
  },
];

const ICON_MAP: Record<string, { icon: string; color: string }> = {
  event: { icon: "calendar", color: "#A7C7E7" },
  announcement: { icon: "megaphone.fill", color: "#E8A0BF" },
  like: { icon: "heart.fill", color: "#FF3B30" },
  comment: { icon: "bubble.left.fill", color: "#34C759" },
  coupon: { icon: "ticket.fill", color: "#FF9500" },
  club_application: { icon: "person.badge.plus", color: "#FF9900" },
  club_approval: { icon: "checkmark.circle.fill", color: "#34C759" },
  event_confirmed: { icon: "checkmark.circle.fill", color: "#34C759" },
  event_deadline: { icon: "clock.fill", color: "#FF9500" },
  event_reminder: { icon: "calendar", color: "#5B9BD5" },
};

function NotificationItem({ notification }: { notification: Notification }) {
  const colors = useColors();
  const router = useRouter();
  const iconConfig = ICON_MAP[notification.type];

  return (
    <Pressable
      onPress={() => {
        if (notification.type === "club_application" || notification.type === "club_approval") {
          router.push("/clubs");
        } else if (notification.type === "event" || notification.type.startsWith("event_")) {
          router.push("/events");
        }
      }}
      style={{
        flexDirection: "row",
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: notification.read ? "transparent" : "#E8A0BF08",
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: iconConfig.color + "15",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        }}
      >
        <IconSymbol name={iconConfig.icon as any} size={20} color={iconConfig.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
          {!notification.read && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#E8A0BF",
                marginRight: 6,
              }}
            />
          )}
          <Text
            style={{
              fontSize: 15,
              fontWeight: notification.read ? "500" : "700",
              color: colors.foreground,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {notification.title}
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 2 }} numberOfLines={1}>
          {notification.body}
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>{notification.time}</Text>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const inAppNotifications = useInAppNotifications()
    .filter((notification) => notification.targetMemberId === CURRENT_USER.id)
    .map<Notification>((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      time: "たった今",
      read: notification.read,
    }));
  const notifications = [...inAppNotifications, ...NOTIFICATIONS];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: Platform.OS === "web" ? 16 : 56,
          paddingBottom: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>通知</Text>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <NotificationItem notification={item} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <IconSymbol name="bell.fill" size={48} color={colors.border} />
            <Text style={{ fontSize: 16, color: colors.muted, marginTop: 12 }}>
              通知はありません
            </Text>
          </View>
        }
      />
    </View>
  );
}
