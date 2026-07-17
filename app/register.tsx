import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";
import { useRouter } from "expo-router";
import { useState } from "react";
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
import { Image } from "expo-image";
import { useAuthContext } from "@/lib/auth-context";

export default function RegisterScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setUser, refresh } = useAuthContext();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const registerMutation = trpc.auth.register.useMutation();

  const handleRegister = async () => {
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }
    if (!email.trim()) {
      setError("メールアドレスを入力してください");
      return;
    }
    if (password.length < 6) {
      setError("パスワードは6文字以上で入力してください");
      return;
    }
    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const result = await registerMutation.mutateAsync({
        email: email.trim(),
        password,
        name: name.trim(),
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
          });
        } else {
          await refresh();
        }
        router.replace("/(tabs)");
      }
    } catch (err: any) {
      const msg = err?.message || "";
      setError(msg.includes("\n") ? msg.split("\n")[0] : msg || "登録に失敗しました");
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
          <View style={{ paddingHorizontal: 24, gap: 20 }}>
            {/* Logo & Title */}
            <View style={{ alignItems: "center", marginBottom: 8 }}>
              <Image
                source={require("@/assets/images/icon.png")}
                style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 12 }}
                contentFit="cover"
              />
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "800",
                  color: colors.foreground,
                }}
              >
                新規登録
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors.muted,
                  marginTop: 4,
                  textAlign: "center",
                  lineHeight: 20,
                }}
              >
                運営から事前に承認されたメールアドレスのみ登録できます
              </Text>
            </View>

            {/* Error */}
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

            {/* Name Input */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                名前
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="表示名を入力"
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                returnKeyType="next"
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 16,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>

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
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 16,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
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
                placeholder="6文字以上"
                placeholderTextColor={colors.muted}
                secureTextEntry
                returnKeyType="next"
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 16,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>

            {/* Confirm Password Input */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                パスワード（確認）
              </Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="もう一度入力"
                placeholderTextColor={colors.muted}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleRegister}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 16,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>

            {/* Register Button */}
            <Pressable
              onPress={handleRegister}
              disabled={loading}
              style={({ pressed }) => ({
                backgroundColor: "#E8A0BF",
                borderRadius: 14,
                padding: 16,
                alignItems: "center",
                opacity: loading ? 0.6 : pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
                marginTop: 4,
              })}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#FFF" }}>
                  登録する
                </Text>
              )}
            </Pressable>

            {/* Login Link */}
            <View style={{ alignItems: "center", marginTop: 4 }}>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ fontSize: 14, color: colors.muted }}>
                  既にアカウントをお持ちの方は{" "}
                  <Text style={{ color: "#E8A0BF", fontWeight: "600" }}>ログイン</Text>
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
