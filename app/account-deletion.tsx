import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  OFFICIAL_LINE_URL,
  PRIVACY_POLICY_URL,
} from "@/constants/external-links";
import { useColors } from "@/hooks/use-colors";
import * as Api from "@/lib/_core/api";
import { useAuthContext } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export default function AccountDeletionScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuthContext();
  const [request, setRequest] = useState<Api.AccountDeletionRequest | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [subscriptionConfirmed, setSubscriptionConfirmed] = useState(false);
  const [dataConfirmed, setDataConfirmed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    Api.getAccountDeletionRequest()
      .then((result) => setRequest(result.request))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const submit = async () => {
    if (!password || !subscriptionConfirmed || !dataConfirmed) {
      Alert.alert(
        "入力内容を確認してください",
        "パスワードと2つの確認項目が必要です。",
      );
      return;
    }
    Alert.alert(
      "アカウント削除を申請しますか？",
      "申請後も処理完了までは取り消せます。運営が確認し、30日以内に削除処理を行います。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除を申請する",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const result = await Api.requestAccountDeletion({
                password,
                understandSubscriptionSeparate: subscriptionConfirmed,
                understandDataHandling: dataConfirmed,
                source: Platform.OS === "web" ? "web" : "app",
              });
              setRequest(result.request);
              setPassword("");
              Alert.alert(
                "申請を受け付けました",
                "削除処理が完了するまで、この画面から申請を取り消せます。",
              );
            } catch (error) {
              Alert.alert(
                "申請できませんでした",
                error instanceof Error
                  ? error.message
                  : "もう一度お試しください。",
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const cancel = () => {
    Alert.alert(
      "削除申請を取り消しますか？",
      "アカウントはそのまま利用できます。",
      [
        { text: "戻る", style: "cancel" },
        {
          text: "申請を取り消す",
          onPress: async () => {
            setLoading(true);
            try {
              await Api.cancelAccountDeletion();
              setRequest(null);
              Alert.alert("取り消しました", "削除申請を取り消しました。");
            } catch (error) {
              Alert.alert(
                "取り消せませんでした",
                error instanceof Error
                  ? error.message
                  : "もう一度お試しください。",
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const CheckRow = ({
    checked,
    onPress,
    children,
  }: {
    checked: boolean;
    onPress: () => void;
    children: string;
  }) => (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 14 }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: checked ? "#C94F7C" : colors.border,
          backgroundColor: checked ? "#C94F7C" : colors.background,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 10,
        }}
      >
        {checked ? (
          <IconSymbol name="checkmark" size={15} color="#FFFFFF" />
        ) : null}
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          lineHeight: 21,
          color: colors.foreground,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );

  return (
    <ScreenContainer>
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
        <Pressable
          accessibilityLabel="戻る"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/login")
          }
          style={{ padding: 4, marginRight: 10 }}
        >
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text
          style={{ fontSize: 21, fontWeight: "900", color: colors.foreground }}
        >
          退会・アカウント削除
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 56 }}>
        <Text
          style={{ fontSize: 14, lineHeight: 23, color: colors.foreground }}
        >
          IRO+アプリのアカウント削除を申請できます。申請内容を運営が確認し、原則30日以内に処理します。
        </Text>

        <View
          style={{
            marginTop: 16,
            borderRadius: 16,
            padding: 15,
            backgroundColor: "#FFF4F4",
            borderWidth: 1,
            borderColor: "#F0CCCC",
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "900", color: "#9A3434" }}>
            削除前にご確認ください
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 13,
              lineHeight: 21,
              color: colors.foreground,
            }}
          >
            ・アプリのアカウント削除だけではSquareの定期決済は解約されません。定期決済の解約は運営へ別途ご連絡ください。
            {"\n"}
            ・プロフィールやログイン情報は削除対象です。法令、会計、不正防止、トラブル対応に必要な取引・監査記録は、必要な期間に限り保持する場合があります。
            {"\n"}
            ・処理完了後はログインできず、元に戻せません。
          </Text>
        </View>

        {authLoading || loading ? (
          <ActivityIndicator color="#C94F7C" style={{ marginTop: 30 }} />
        ) : !isAuthenticated ? (
          <View style={{ marginTop: 24, alignItems: "center" }}>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 22,
                textAlign: "center",
                color: colors.muted,
              }}
            >
              本人確認のため、削除するアカウントへログインしてください。アプリを再インストールする必要はありません。
            </Text>
            <Pressable
              onPress={() => router.push("/login")}
              style={{
                width: "100%",
                minHeight: 50,
                marginTop: 18,
                borderRadius: 14,
                backgroundColor: "#C94F7C",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "900" }}
              >
                ログインして削除申請へ
              </Text>
            </Pressable>
          </View>
        ) : request ? (
          <View
            style={{
              marginTop: 22,
              borderRadius: 18,
              padding: 17,
              backgroundColor: "#FFF8EA",
              borderWidth: 1,
              borderColor: "#EDC777",
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#A46400" }}>
              削除申請を受付済みです
            </Text>
            <Text
              style={{
                marginTop: 9,
                fontSize: 14,
                lineHeight: 22,
                color: colors.foreground,
              }}
            >
              申請日：{formatDate(request.requestedAt)}
              {"\n"}処理予定期限：{formatDate(request.scheduledFor)}
            </Text>
            <Pressable
              onPress={cancel}
              style={{
                minHeight: 48,
                marginTop: 18,
                borderRadius: 13,
                borderWidth: 1,
                borderColor: "#A46400",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ color: "#A46400", fontSize: 15, fontWeight: "900" }}
              >
                削除申請を取り消す
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: 22 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "900",
                color: colors.foreground,
              }}
            >
              現在のパスワード
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="本人確認のため入力"
              placeholderTextColor={colors.muted}
              style={{
                minHeight: 50,
                marginTop: 8,
                borderRadius: 13,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 14,
                fontSize: 16,
                color: colors.foreground,
              }}
            />
            <CheckRow
              checked={subscriptionConfirmed}
              onPress={() => setSubscriptionConfirmed((value) => !value)}
            >
              Squareの定期決済は別途解約手続きが必要であることを確認しました。
            </CheckRow>
            <CheckRow
              checked={dataConfirmed}
              onPress={() => setDataConfirmed((value) => !value)}
            >
              削除後は元に戻せず、法令等で必要な記録が一定期間保持される場合があることを確認しました。
            </CheckRow>
            <Pressable
              onPress={() => void submit()}
              style={{
                minHeight: 52,
                marginTop: 22,
                borderRadius: 14,
                backgroundColor:
                  password && subscriptionConfirmed && dataConfirmed
                    ? "#C94F7C"
                    : "#E8D8DE",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "900" }}
              >
                アカウント削除を申請する
              </Text>
            </Pressable>
          </View>
        )}

        <View
          style={{
            marginTop: 28,
            flexDirection: "row",
            justifyContent: "center",
            gap: 18,
          }}
        >
          <Pressable onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>
            <Text style={{ color: "#5B78A5", textDecorationLine: "underline" }}>
              プライバシーポリシー
            </Text>
          </Pressable>
          <Pressable onPress={() => void Linking.openURL(OFFICIAL_LINE_URL)}>
            <Text style={{ color: "#5B78A5", textDecorationLine: "underline" }}>
              運営へ問い合わせる
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
