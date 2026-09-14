import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Auth from "@/lib/_core/auth";
import * as Api from "@/lib/_core/api";
import { refreshClubs } from "@/lib/club-store";
import { logger } from "@/lib/_core/logger";
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
import { useAuthContext } from "@/lib/auth-context";
import { BrandLogo } from "@/components/brand-logo";

export default function RegisterScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setUser, refresh } = useAuthContext();
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);

  const handleRegister = async () => {
    if (!email.trim()) {
      setError("メールアドレスを入力してください");
      return;
    }
    if (!/^\d{6}$/.test(verificationCode)) {
      setError("メールに届いた6桁の認証コードを入力してください");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください");
      return;
    }
    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const result = await Api.register({
        email: email.trim(),
        password,
        verificationCode,
      });

      if (result.success && result.sessionToken) {
        // Store session token for native
        if (Platform.OS !== "web") {
          await Auth.setSessionToken(result.sessionToken);
        }
        // Cache user info
        if (result.user) {
          const authenticatedUser: Auth.User = {
            id: result.user.id,
            openId: result.user.openId,
            name: result.user.name,
            email: result.user.email,
            loginMethod: result.user.loginMethod,
            lastSignedIn: new Date(result.user.lastSignedIn),
            firstSignedIn: new Date(result.user.firstSignedIn ?? result.user.lastSignedIn),
            role: Auth.normalizeUserRole(result.user.role),
            accessRole: Auth.normalizeAccessRole(result.user.accessRole),
            branch: Auth.normalizeBranchRole(result.user.branch),
            branches: Auth.normalizeBranchRoles(
              result.user.branches,
              result.user.branch,
            ),
            memberId: result.user.memberId,
            memberTerm: result.user.memberTerm,
            memberRank: result.user.memberRank,
            joinedAt: result.user.joinedAt,
            achievementBadges: result.user.achievementBadges,
            profile: result.user.profile,
            xp: result.user.xp,
            participationCount: result.user.participationCount,
            organizerCount: result.user.organizerCount,
          };
          await Auth.setUserInfo(authenticatedUser);
          setUser(authenticatedUser);
        }
        await Promise.all([refresh(), refreshClubs()]);
        router.replace("/(tabs)");
      }
    } catch (err: any) {
      logger.error("Registration failed", err);
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
          <View
            style={{
              width: "100%",
              maxWidth: 440,
              alignSelf: "center",
              paddingHorizontal: 22,
              paddingVertical: 20,
              gap: 16,
            }}
          >
            {/* Logo & Title */}
            <View style={{ alignItems: "center", marginBottom: 8 }}>
              <BrandLogo width={210} compact style={{ marginBottom: 6 }} />
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "800",
                  color: colors.foreground,
                }}
              >
                初回パスワード設定
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
                IRO+にご登録のメールアドレスを入力してください。その後メールで届く認証コードを入力し、パスワードを設定してください。
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
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.error,
                    textAlign: "center",
                  }}
                >
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Email Input */}
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: colors.foreground,
                }}
              >
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
                  padding: 14,
                  fontSize: 16,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Pressable
                disabled={!email.trim() || codeLoading}
                onPress={async () => {
                  setError("");
                  setCodeLoading(true);
                  setCodeSent(false);
                  try {
                    await Api.requestSetupCode(email.trim());
                    setCodeSent(true);
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "認証コードを送信できませんでした",
                    );
                  } finally {
                    setCodeLoading(false);
                  }
                }}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#D97FA8",
                  paddingVertical: 11,
                  alignItems: "center",
                  opacity: !email.trim() ? 0.45 : 1,
                }}
              >
                <Text
                  style={{ fontSize: 14, fontWeight: "800", color: "#D97FA8" }}
                >
                  {codeLoading
                    ? "送信中..."
                    : codeSent
                      ? "認証コードを再送する"
                      : "認証コードを送信"}
                </Text>
              </Pressable>
              <TextInput
                value={verificationCode}
                onChangeText={setVerificationCode}
                placeholder="6桁の認証コード"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={6}
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 14,
                  padding: 14,
                  fontSize: 18,
                  letterSpacing: 5,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  textAlign: "center",
                }}
              />
              {codeSent ? (
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.muted,
                    textAlign: "center",
                  }}
                >
                  認証コードの送信を受け付けました。有効期限は10分です。届かない場合は迷惑メールと会費決済時のメールアドレスを確認し、運営にお問い合わせください。
                </Text>
              ) : null}
            </View>

            {/* Password Input */}
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: colors.foreground,
                }}
              >
                パスワード
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="8文字以上"
                placeholderTextColor={colors.muted}
                secureTextEntry
                returnKeyType="next"
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 14,
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
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: colors.foreground,
                }}
              >
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
                  backgroundColor: colors.background,
                  borderRadius: 14,
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
                backgroundColor: "#18171A",
                borderRadius: 16,
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
                <Text
                  style={{ fontSize: 17, fontWeight: "700", color: "#FFF" }}
                >
                  パスワードを設定する
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
                  <Text style={{ color: "#D97FA8", fontWeight: "700" }}>
                    ログイン
                  </Text>
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
