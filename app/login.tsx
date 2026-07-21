import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";
import { logger } from "@/lib/_core/logger";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuthContext } from "@/lib/auth-context";
import { BrandLogo } from "@/components/brand-logo";

const previewLoginEnabled = process.env.EXPO_PUBLIC_PREVIEW_LOGIN_ENABLED === "true";
const previewUserRole: Auth.UserRole =
  process.env.EXPO_PUBLIC_PREVIEW_USER_ROLE === "user" ? "user" : "admin";

const previewUser: Auth.User = {
  id: 1,
  openId: "preview-user",
  name: "かずま",
  email: "preview@irotas.local",
  loginMethod: "preview",
  lastSignedIn: new Date(),
  role: previewUserRole,
  branch: null,
};

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setUser, refresh } = useAuthContext();
  const [email, setEmail] = useState(previewLoginEnabled ? "1" : "");
  const [password, setPassword] = useState(previewLoginEnabled ? "1" : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loginMutation = trpc.auth.login.useMutation();

  useEffect(() => {
    if (!previewLoginEnabled) return;

    let active = true;
    Auth.setUserInfo(previewUser).then(() => {
      if (!active) return;
      setUser(previewUser);
      router.replace("/(tabs)");
    });

    return () => {
      active = false;
    };
  }, [router, setUser]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("メールアドレスとパスワードを入力してください");
      return;
    }

    setError("");
    setLoading(true);

    try {
      if (previewLoginEnabled && email.trim() === "1" && password === "1") {
        await Auth.setUserInfo(previewUser);
        setUser(previewUser);
        router.replace("/(tabs)");
        return;
      }

      const result = await loginMutation.mutateAsync({
        email: email.trim(),
        password,
      });

      if (result.success && result.sessionToken) {
        // Store session token for native
        if (Platform.OS !== "web") {
          await Auth.setSessionToken(result.sessionToken);
        }
        // Cache user info
        if (result.user) {
          await Auth.setUserInfo({
            id: result.user.id,
            openId: result.user.openId,
            name: result.user.name,
            email: result.user.email,
            loginMethod: result.user.loginMethod,
            lastSignedIn: new Date(result.user.lastSignedIn),
            role: Auth.normalizeUserRole(result.user.role),
            branch: Auth.normalizeBranchRole(result.user.branch),
          });
        }
        // Update auth context and navigate
        if (result.user) {
          setUser({
            id: result.user.id,
            openId: result.user.openId,
            name: result.user.name,
            email: result.user.email,
            loginMethod: result.user.loginMethod,
            lastSignedIn: new Date(result.user.lastSignedIn),
            role: Auth.normalizeUserRole(result.user.role),
            branch: Auth.normalizeBranchRole(result.user.branch),
          });
        } else {
          await refresh();
        }
        router.replace("/(tabs)");
      }
    } catch (err: any) {
      logger.error("Login failed", err);
      const userMessage = logger.getUserMessage(err);
      setError(userMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: "100%", maxWidth: 440, alignSelf: "center", paddingHorizontal: 22, gap: 18 }}>
            {/* Logo & Title */}
            <View style={{ alignItems: "center", marginBottom: 4 }}>
              <BrandLogo width={250} />
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "800",
                  color: colors.foreground,
                  marginTop: -8,
                }}
              >
                おかえりなさい
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors.muted,
                  marginTop: 7,
                }}
              >
                会員限定コミュニティへログイン
              </Text>
            </View>

            <View
              style={{
                gap: 18,
                backgroundColor: colors.surface,
                borderRadius: 26,
                padding: 20,
                borderWidth: 1,
                borderColor: colors.border,
                shadowColor: "#866474",
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.12,
                shadowRadius: 28,
                elevation: 5,
              }}
            >

            {/* Error */}
            {previewLoginEnabled ? (
              <View
                style={{
                  backgroundColor: "#EEF7FC",
                  borderRadius: 14,
                  padding: 10,
                }}
              >
                <Text style={{ fontSize: 13, color: colors.foreground, textAlign: "center" }}>
                  プレビューモード：メールアドレス・パスワードは「1」
                </Text>
              </View>
            ) : null}

            {error ? (
              <View
                style={{
                  backgroundColor: colors.error + "15",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <Text style={{ fontSize: 14, color: colors.error, textAlign: "center" }}>
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Email Input */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                メールアドレス
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="example@email.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 14,
                  paddingHorizontal: 15,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: "#E9DDE3",
                }}
              />
            </View>

            {/* Password Input */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                パスワード
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="パスワード"
                placeholderTextColor={colors.muted}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 14,
                  paddingHorizontal: 15,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: "#E9DDE3",
                }}
              />
            </View>

            {/* Login Button */}
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => ({
                backgroundColor: "#18171A",
                borderRadius: 16,
                padding: 16,
                alignItems: "center",
                opacity: loading ? 0.6 : pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#FFF" }}>
                  ログイン
                </Text>
              )}
            </Pressable>

            {/* Register Link */}
            <View style={{ alignItems: "center", marginTop: 8 }}>
              <Pressable
                onPress={() => router.push("/register" as any)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ fontSize: 14, color: colors.muted }}>
                  アカウントをお持ちでない方は{" "}
                  <Text style={{ color: "#D97FA8", fontWeight: "700" }}>新規登録</Text>
                </Text>
              </Pressable>
            </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
