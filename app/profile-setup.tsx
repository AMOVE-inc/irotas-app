import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import { markNativeProfileSetupComplete } from "@/lib/native-profile-setup";
import * as Api from "@/lib/_core/api";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

export default function ProfileSetupScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, refresh } = useAuthContext();
  const [name, setName] = useState(user?.name?.trim() ?? "");
  const [publicUserId, setPublicUserId] = useState(user?.publicUserId ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const normalizedName = name.trim();
    const normalizedId = publicUserId.trim().replace(/^@+/, "").toLowerCase();
    if (!normalizedName) return Alert.alert("名前を入力してください");
    if (!/^[a-z0-9][a-z0-9._]{2,23}$/.test(normalizedId) || normalizedId.endsWith(".")) {
      return Alert.alert("公開ユーザーIDを確認してください", "3〜24文字の半角英小文字・数字・ピリオド・アンダーバーで入力してください。");
    }
    if (!user) return;
    setSaving(true);
    try {
      await Api.updateMyProfile({ displayName: normalizedName, publicUserId: normalizedId, profile: user.profile ?? {} });
      await markNativeProfileSetupComplete(user.id);
      await refresh();
      router.replace("/(tabs)");
    } catch (error) {
      Alert.alert("保存できませんでした", error instanceof Error ? error.message : "通信状況を確認してもう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  return <ScreenContainer>
    <View style={{ flex: 1, paddingHorizontal: 22, paddingTop: 42 }}>
      <Text style={{ fontSize: 27, fontWeight: "900", color: colors.foreground }}>プロフィールを設定</Text>
      <Text style={{ marginTop: 10, fontSize: 14, lineHeight: 21, color: colors.muted }}>スマホアプリを使い始める前に、表示名と公開ユーザーIDを設定してください。</Text>
      <Text style={{ marginTop: 30, marginBottom: 7, fontSize: 13, fontWeight: "800", color: colors.foreground }}>名前（必須）</Text>
      <TextInput value={name} onChangeText={setName} placeholder="表示する名前" placeholderTextColor={colors.muted} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.foreground }} />
      <Text style={{ marginTop: 20, marginBottom: 7, fontSize: 13, fontWeight: "800", color: colors.foreground }}>公開ユーザーID（必須）</Text>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 13, paddingHorizontal: 14 }}><Text style={{ fontSize: 16, color: colors.muted }}>@</Text><TextInput value={publicUserId} onChangeText={(value) => setPublicUserId(value.replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 24))} placeholder="your.name" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, paddingVertical: 13, fontSize: 16, color: colors.foreground }} /></View>
      <Text style={{ marginTop: 7, fontSize: 11, lineHeight: 17, color: colors.muted }}>プロフィール、検索、メンション候補に表示されます。内部識別子は表示されません。</Text>
      <Pressable disabled={saving || !name.trim() || !publicUserId.trim()} onPress={() => void save()} style={{ marginTop: 30, minHeight: 54, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: !saving && name.trim() && publicUserId.trim() ? "#D56591" : colors.border }}><Text style={{ fontSize: 16, fontWeight: "900", color: "#FFF" }}>{saving ? "保存中…" : "保存してはじめる"}</Text></Pressable>
    </View>
  </ScreenContainer>;
}
