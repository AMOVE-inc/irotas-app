import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { notificationPermissionGranted, registerPushNotificationsForCurrentDevice } from "@/lib/notifications";
import * as Api from "@/lib/_core/api";
import { DEFAULT_NOTIFICATION_PREFERENCES, getNotificationPreferences, saveNotificationPreferences, type NotificationPreferenceId } from "@/lib/notification-preferences";

interface NotificationSetting {
  id: string;
  icon: string;
  iconColor: string;
  label: string;
  description: string;
  enabled: boolean;
}

export default function NotificationSettingsScreen() {
  const colors = useColors();
  const router = useRouter();

  const [settings, setSettings] = useState<NotificationSetting[]>([
    {
      id: "mention",
      icon: "at",
      iconColor: "#E8A0BF",
      label: "メンション",
      description: "チャットで@メンションされたときに通知",
      enabled: true,
    },
    {
      id: "chat_message",
      icon: "bubble.left.and.bubble.right.fill",
      iconColor: "#E8A0BF",
      label: "チャットメッセージ",
      description: "参加中のチャットに新しいメッセージが届いたときに通知",
      enabled: true,
    },
    {
      id: "event_reminder",
      icon: "calendar.badge.clock",
      iconColor: "#A7C7E7",
      label: "イベントリマインダー",
      description: "参加イベントの前日・当日に通知",
      enabled: true,
    },
    {
      id: "event_approved",
      icon: "checkmark.circle.fill",
      iconColor: "#34C759",
      label: "イベント参加承認",
      description: "イベントへの参加が承認されたときに通知",
      enabled: true,
    },
    {
      id: "club_leader",
      icon: "crown.fill",
      iconColor: "#FF9500",
      label: "部長任命",
      description: "部長に任命されたときに通知",
      enabled: true,
    },
    {
      id: "club_join",
      icon: "person.badge.plus",
      iconColor: "#AF52DE",
      label: "部活動参加申請",
      description: "部活動への参加申請が届いたときに通知（部長のみ）",
      enabled: true,
    },
    {
      id: "board_reply",
      icon: "bubble.left.and.bubble.right.fill",
      iconColor: "#A7C7E7",
      label: "掲示板への返信",
      description: "自分の投稿にコメントが付いたときに通知",
      enabled: true,
    },
    {
      id: "board_approved",
      icon: "person.fill.checkmark",
      iconColor: "#34C759",
      label: "掲示板参加承認",
      description: "掲示板スレッドへの参加が承認されたときに通知",
      enabled: true,
    },
    {
      id: "new_event",
      icon: "calendar.badge.plus",
      iconColor: "#E8A0BF",
      label: "新規イベント",
      description: "新しいイベントが公開されたときに通知",
      enabled: true,
    },
    {
      id: "points",
      icon: "star.fill",
      iconColor: "#FF9500",
      label: "ポイント付与",
      description: "ポイントが付与されたときに通知",
      enabled: true,
    },
    {
      id: "rank_up",
      icon: "arrow.up.circle.fill",
      iconColor: "#E8A0BF",
      label: "ランクアップ",
      description: "ランクが上がったときに通知",
      enabled: true,
    },
  ]);

  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    void notificationPermissionGranted().then(setPermissionGranted);
    void getNotificationPreferences().then((saved) => {
      setSettings((current) => current.map((setting) => ({ ...setting, enabled: saved[setting.id as NotificationPreferenceId] })));
    });
  }, []);

  const persist = (next: NotificationSetting[]) => {
    const value = { ...DEFAULT_NOTIFICATION_PREFERENCES };
    next.forEach((setting) => { value[setting.id as NotificationPreferenceId] = setting.enabled; });
    void saveNotificationPreferences(value);
    void Api.updatePushNotificationPreferences(value).catch(() => {});
    return next;
  };

  const toggleSetting = (id: string) => {
    setSettings((prev) => persist(prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))));
  };

  const handleRequestPermission = async () => {
    const granted = Boolean(await registerPushNotificationsForCurrentDevice());
    setPermissionGranted(granted);
    if (granted) {
      Alert.alert("許可されました", "プッシュ通知が有効になりました。");
    } else {
      Alert.alert(
        "許可が必要です",
        "iOSの設定 > IRO＋ > 通知 から通知を有効にしてください。",
      );
    }
  };

  const enabledCount = settings.filter((s) => s.enabled).length;

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>
            通知設定
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {enabledCount}/{settings.length}件の通知が有効
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* 通知権限バナー */}
        {!permissionGranted && (
          <Pressable
            onPress={handleRequestPermission}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#FF950020",
              borderRadius: 14,
              padding: 14,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: "#FF950040",
            }}
          >
            <IconSymbol name="bell.slash.fill" size={20} color="#FF9500" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#FF9500" }}>
                通知が無効になっています
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                タップして通知を許可する
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color="#FF9500" />
          </Pressable>
        )}

        {/* 全て切り替え */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surface,
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <IconSymbol name="bell.fill" size={20} color="#E8A0BF" />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: colors.foreground, marginLeft: 12 }}>
            すべての通知
          </Text>
          <Switch
            value={settings.every((s) => s.enabled)}
            onValueChange={(val) =>
              setSettings((prev) => persist(prev.map((s) => ({ ...s, enabled: val }))))
            }
            trackColor={{ false: colors.border, true: "#E8A0BF" }}
            thumbColor="#FFF"
          />
        </View>

        {/* 個別設定 */}
        <Text
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: colors.muted,
            marginBottom: 10,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          通知の種類
        </Text>
        {settings.map((setting) => (
          <View
            key={setting.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 14,
              marginBottom: 8,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                backgroundColor: setting.iconColor + "20",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <IconSymbol name={setting.icon as any} size={18} color={setting.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "500", color: colors.foreground }}>
                {setting.label}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                {setting.description}
              </Text>
            </View>
            <Switch
              value={setting.enabled}
              onValueChange={() => toggleSetting(setting.id)}
              trackColor={{ false: colors.border, true: "#E8A0BF" }}
              thumbColor="#FFF"
            />
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
