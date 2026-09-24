import { openExternalUrl } from "@/lib/open-external-url";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useAuthContext } from "@/lib/auth-context";
import * as Api from "@/lib/_core/api";
import {
  COMMUNITY_TERMS_URL,
  PRIVACY_POLICY_URL,
} from "@/constants/external-links";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";

export default function AppSettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { logout } = useAuthContext();

  const [settings, setSettings] = useState({ allowMentions: true });

  const toggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleClearCache = () => {
    Alert.alert(
      "キャッシュをクリア",
      "アプリのキャッシュを削除します。次回起動時に再読み込みが発生します。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "クリア",
          style: "destructive",
          onPress: () => Alert.alert("完了", "キャッシュをクリアしました。"),
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert("ログアウト", "ログアウトしますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "ログアウト",
        style: "destructive",
        onPress: async () => {
          if (Api.submitBrowserLogout()) return;
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const SectionHeader = ({ title }: { title: string }) => (
    <Text
      style={{
        fontSize: 13,
        fontWeight: "700",
        color: colors.muted,
        marginTop: 24,
        marginBottom: 8,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {title}
    </Text>
  );

  const SettingRow = ({
    icon,
    iconColor,
    label,
    sublabel,
    value,
    onToggle,
    onPress,
    rightLabel,
    isDestructive,
  }: {
    icon: string;
    iconColor: string;
    label: string;
    sublabel?: string;
    value?: boolean;
    onToggle?: () => void;
    onPress?: () => void;
    rightLabel?: string;
    isDestructive?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress && !onToggle}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        opacity: pressed && onPress ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          backgroundColor: (isDestructive ? "#FF3B30" : iconColor) + "20",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        }}
      >
        <IconSymbol
          name={icon as any}
          size={18}
          color={isDestructive ? "#FF3B30" : iconColor}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "500",
            color: isDestructive ? "#FF3B30" : colors.foreground,
          }}
        >
          {label}
        </Text>
        {sublabel && (
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
            {sublabel}
          </Text>
        )}
      </View>
      {onToggle !== undefined && value !== undefined && (
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: "#E8A0BF" }}
          thumbColor="#FFF"
        />
      )}
      {rightLabel && (
        <Text style={{ fontSize: 14, color: colors.muted }}>{rightLabel}</Text>
      )}
      {onPress && !rightLabel && (
        <IconSymbol name="chevron.right" size={14} color={colors.muted} />
      )}
    </Pressable>
  );

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
        <Text
          style={{
            fontSize: 20,
            fontWeight: "800",
            color: colors.foreground,
            marginLeft: 12,
          }}
        >
          アプリ設定
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      >
        {/* 通知設定は1画面に集約 */}
        <SectionHeader title="通知" />
        <SettingRow
          icon="bell.fill"
          iconColor="#E8A0BF"
          label="通知設定"
          sublabel="通知の種類と端末の通知許可を設定"
          onPress={() => router.push("/notification-settings" as any)}
        />

        {/* プライバシー */}
        <SectionHeader title="プライバシー" />
        <SettingRow
          icon="at"
          iconColor="#A7C7E7"
          label="メンションを許可"
          sublabel="他のメンバーから@メンションを受け取る"
          value={settings.allowMentions}
          onToggle={() => toggle("allowMentions")}
        />

        {/* アプリ情報 */}
        <SectionHeader title="アプリ情報" />
        <SettingRow
          icon="info.circle.fill"
          iconColor="#8E8E93"
          label="バージョン"
          rightLabel="1.0.0"
        />
        <SettingRow
          icon="doc.text.fill"
          iconColor="#8E8E93"
          label="利用規約"
          onPress={() => void openExternalUrl(COMMUNITY_TERMS_URL)}
        />
        <SettingRow
          icon="lock.fill"
          iconColor="#8E8E93"
          label="プライバシーポリシー"
          onPress={() => void openExternalUrl(PRIVACY_POLICY_URL)}
        />
        <SettingRow
          icon="trash.fill"
          iconColor="#8E8E93"
          label="キャッシュをクリア"
          onPress={handleClearCache}
        />

        {/* ログアウト */}
        <SectionHeader title="アカウント" />
        <SettingRow
          icon="person.crop.circle.badge.minus"
          iconColor="#FF3B30"
          label="休会・退会手続き"
          sublabel="削除申請と申請状況の確認"
          onPress={() => router.push("/account-deletion" as any)}
          isDestructive
        />
        <SettingRow
          icon="rectangle.portrait.and.arrow.right"
          iconColor="#FF3B30"
          label="ログアウト"
          onPress={handleLogout}
          isDestructive
        />
      </ScrollView>
    </ScreenContainer>
  );
}
