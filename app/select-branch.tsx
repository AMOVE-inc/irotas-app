import { BrandLogo } from "@/components/brand-logo";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import * as Auth from "@/lib/_core/auth";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

const previewLoginEnabled = process.env.EXPO_PUBLIC_PREVIEW_LOGIN_ENABLED === "true";

const BRANCHES: {
  key: Auth.BranchRole;
  title: string;
  description: string;
}[] = [
  { key: "kanto", title: "関東支部", description: "東京・神奈川・千葉・埼玉を中心に活動" },
  { key: "kansai", title: "関西支部", description: "大阪・京都・兵庫・奈良を中心に活動" },
];

export default function SelectBranchScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, setUser } = useAuthContext();
  const [selected, setSelected] = useState<Auth.BranchRole | null>(null);
  const [error, setError] = useState("");
  const mutation = trpc.auth.selectBranch.useMutation();

  const handleConfirm = async () => {
    if (!selected || !user) return;
    setError("");

    try {
      if (!previewLoginEnabled) {
        await mutation.mutateAsync({ branch: selected });
      }
      const updatedUser: Auth.User = { ...user, branch: selected };
      await Auth.setUserInfo(updatedUser);
      setUser(updatedUser);
      router.replace("/(tabs)");
    } catch {
      setError("所属支部を保存できませんでした。通信状況を確認してもう一度お試しください。");
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 22 }}>
        <View style={{ width: "100%", maxWidth: 440, alignSelf: "center" }}>
          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <BrandLogo width={220} />
            <Text style={{ fontSize: 25, fontWeight: "800", color: colors.foreground }}>
              所属する支部を選択
            </Text>
            <Text
              style={{ fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: "center", marginTop: 8 }}
            >
              エリア別の掲示板やイベント表示に使用します。{`\n`}支部の変更は運営へお問い合わせください。
            </Text>
          </View>

          <View style={{ gap: 12 }}>
            {BRANCHES.map((branch) => {
              const active = selected === branch.key;
              return (
                <Pressable
                  key={branch.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => setSelected(branch.key)}
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
                      <Text style={{ fontSize: 13, color: colors.muted, marginTop: 5 }}>
                        {branch.description}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: active ? colors.primary : colors.border,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {active ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary }} /> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {error ? <Text style={{ color: colors.error, textAlign: "center", marginTop: 14 }}>{error}</Text> : null}

          <Pressable
            disabled={!selected || mutation.isPending}
            onPress={handleConfirm}
            style={({ pressed }) => ({
              marginTop: 22,
              minHeight: 54,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: selected ? colors.primary : colors.border,
              opacity: pressed ? 0.82 : 1,
            })}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>この支部で始める</Text>
            )}
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}
