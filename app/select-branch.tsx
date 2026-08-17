import { BrandLogo } from "@/components/brand-logo";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import * as Auth from "@/lib/_core/auth";
import * as Api from "@/lib/_core/api";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";

const previewLoginEnabled = process.env.EXPO_PUBLIC_PREVIEW_LOGIN_ENABLED === "true";

const BRANCHES: {
  key: Auth.BranchRole;
  title: string;
}[] = [
  { key: "kanto", title: "関東支部" },
  { key: "kansai", title: "関西支部" },
];

export default function SelectBranchScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, setUser, logout } = useAuthContext();
  const currentBranches = Auth.normalizeBranchRoles(user?.branches, user?.branch);
  const isEditing = currentBranches.length > 0;
  const [selected, setSelected] = useState<Auth.BranchRole[]>(currentBranches);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const mutation = trpc.auth.selectBranches.useMutation();

  const toggleBranch = (branch: Auth.BranchRole) => {
    setSelected((current) =>
      current.includes(branch)
        ? current.filter((item) => item !== branch)
        : [...current, branch],
    );
  };

  const handleConfirm = async () => {
    if (selected.length === 0 || !user) return;
    setError("");
    setSaving(true);

    try {
      if (!previewLoginEnabled) {
        try {
          await Api.selectBranches(selected);
        } catch (error) {
          if (!(error instanceof Api.ApiError) || error.statusCode !== 404)
            throw error;
          await mutation.mutateAsync({ branches: selected });
        }
      }
      const updatedUser: Auth.User = {
        ...user,
        branch: selected[0],
        branches: selected,
      };
      await Auth.setUserInfo(updatedUser);
      setUser(updatedUser);
      router.replace(isEditing ? "/(tabs)/profile" : "/(tabs)");
    } catch {
      setError("所属支部を保存できませんでした。通信状況を確認してもう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchAccount = async () => {
    setLoggingOut(true);
    setError("");
    try {
      await logout();
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.replace("/login");
        return;
      }
      router.replace("/login");
    } catch {
      setError("ログアウトできませんでした。通信状況を確認してもう一度お試しください。");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      {isEditing ? (
        <Pressable
          onPress={() => router.back()}
          style={{ position: "absolute", top: 18, left: 18, zIndex: 2, padding: 8 }}
        >
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
      ) : null}

      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 22 }}>
        <View style={{ width: "100%", maxWidth: 440, alignSelf: "center" }}>
          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <BrandLogo width={220} />
            <Text style={{ fontSize: 25, fontWeight: "800", color: colors.foreground }}>
              {isEditing ? "所属支部を変更" : "所属する支部を選択"}
            </Text>
            <Text
              style={{ fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: "center", marginTop: 8 }}
            >
              選択した支部からの通知が届きます。{`\n`}所属支部はマイページからいつでも変更できます。
            </Text>
          </View>

          <View style={{ gap: 12 }}>
            {BRANCHES.map((branch) => {
              const active = selected.includes(branch.key);
              return (
                <Pressable
                  key={branch.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  onPress={() => toggleBranch(branch.key)}
                  style={({ pressed }) => ({
                    borderRadius: 20,
                    padding: 20,
                    borderWidth: 2,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? `${colors.primary}12` : colors.surface,
                    opacity: pressed ? 0.82 : 1,
                  })}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 19, fontWeight: "800", color: colors.foreground }}>
                        {branch.title}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        borderWidth: 2,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {active ? <IconSymbol name="checkmark" size={17} color="#FFFFFF" /> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {selected.length === 0 ? (
            <Text style={{ color: colors.muted, textAlign: "center", marginTop: 12 }}>
              支部を1つ以上選択してください
            </Text>
          ) : null}
          {error ? <Text style={{ color: colors.error, textAlign: "center", marginTop: 14 }}>{error}</Text> : null}

          <Pressable
            disabled={selected.length === 0 || saving || loggingOut}
            onPress={handleConfirm}
            style={({ pressed }) => ({
              marginTop: 22,
              minHeight: 54,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: selected.length > 0 ? colors.primary : colors.border,
              opacity: pressed ? 0.82 : 1,
            })}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>
                {isEditing ? "所属支部を保存" : "選択した支部で始める"}
              </Text>
            )}
          </Pressable>

          {!isEditing ? (
            <Pressable
              disabled={loggingOut}
              onPress={handleSwitchAccount}
              style={({ pressed }) => ({
                alignSelf: "center",
                marginTop: 18,
                paddingHorizontal: 14,
                paddingVertical: 10,
                opacity: loggingOut ? 0.5 : pressed ? 0.65 : 1,
              })}
            >
              <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700" }}>
                {loggingOut ? "ログアウト中…" : "別のアカウントでログイン"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </ScreenContainer>
  );
}
