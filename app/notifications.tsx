import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, Text, View } from "react-native";
import * as Api from "@/lib/_core/api";

type Notification = Api.AppNotification;
const cleanSystemLabel = (value: string) => value.replace(/^【IRO\+\s*システム】\s*/, "");

const ICON_MAP: Record<string, { icon: string; color: string }> = {
  event: { icon: "calendar", color: "#A7C7E7" },
  announcement: { icon: "megaphone.fill", color: "#E8A0BF" },
  like: { icon: "heart.fill", color: "#FF3B30" },
  comment: { icon: "bubble.left.fill", color: "#34C759" },
  chat: { icon: "bubble.left.and.bubble.right.fill", color: "#5865F2" },
  follow: { icon: "person.badge.plus", color: "#E8A0BF" },
  coupon: { icon: "ticket.fill", color: "#FF9500" },
  club_application: { icon: "person.badge.plus", color: "#FF9900" },
  club_approval: { icon: "checkmark.circle.fill", color: "#34C759" },
  event_confirmed: { icon: "checkmark.circle.fill", color: "#34C759" },
  event_deadline: { icon: "clock.fill", color: "#FF9500" },
  event_reminder: { icon: "calendar", color: "#5B9BD5" },
  event_cancellation: { icon: "exclamationmark.triangle.fill", color: "#D94C55" },
  event_feedback: { icon: "star.fill", color: "#D69A14" },
};

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}日前`;
  return new Date(value).toLocaleDateString("ja-JP");
}

function NotificationItem({ notification, onOpen }: { notification: Notification; onOpen: (notification: Notification) => void }) {
  const colors = useColors();
  const iconConfig = ICON_MAP[notification.type] ?? ICON_MAP.announcement;

  return (
    <Pressable
      onPress={() => onOpen(notification)}
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
            {cleanSystemLabel(notification.title).replace(/^イベント参加が取り消されました$/, "イベントのキャンセルが確定しました")}
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 2 }} numberOfLines={1}>
          {cleanSystemLabel(notification.body)}
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>{relativeTime(notification.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    let pending = false;
    let loaded = false;
    const refresh = () => {
      if (pending || (Platform.OS === "web" && document.visibilityState === "hidden")) return;
      pending = true;
      void Api.getNotifications()
        .then((items) => { if (mounted) { loaded = true; setNotifications(items); setError(""); } })
        .catch((cause) => { if (mounted && !loaded) setError(cause instanceof Error ? cause.message : "通知を読み込めませんでした"); })
        .finally(() => { pending = false; if (mounted) setLoading(false); });
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  const openNotification = async (notification: Notification) => {
    if (!notification.read) {
      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item));
      try { await Api.markNotificationRead(notification.id); } catch {}
    }
    if (notification.targetPath?.startsWith("/board?") || notification.targetPath?.startsWith("/chat?") || notification.targetPath?.startsWith("/member-profile?")) {
      router.push(notification.targetPath as any);
    } else if (notification.type === "club_application" || notification.type === "club_approval") {
      router.push("/clubs");
    } else if (notification.type === "event_feedback" && notification.eventId) {
      router.push({ pathname: "/event-feedback", params: { id: notification.eventId } });
    } else if (notification.type === "event" || notification.type.startsWith("event_")) {
      router.push(notification.eventId ? { pathname: "/event-detail", params: { id: notification.eventId } } : "/events");
    }
  };

  const markAllRead = async () => {
    setNotifications((items) => items.map((item) => ({ ...item, read: true })));
    try { await Api.markAllNotificationsRead(); } catch {}
  };

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
        {notifications.some((item) => !item.read) ? (
          <Pressable onPress={() => { void markAllRead(); }} style={{ marginLeft: "auto", paddingVertical: 6, paddingLeft: 12 }}>
            <Text style={{ color: "#D26C98", fontSize: 13, fontWeight: "700" }}>すべて既読</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 60 }} color="#D26C98" /> : error ? (
        <View style={{ padding: 24 }}><Text style={{ color: colors.error, textAlign: "center" }}>{error}</Text></View>
      ) : <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <NotificationItem notification={item} onOpen={openNotification} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <IconSymbol name="bell.fill" size={48} color={colors.border} />
            <Text style={{ fontSize: 16, color: colors.muted, marginTop: 12 }}>
              通知はありません
            </Text>
          </View>
        }
      />}
    </View>
  );
}
