import { openExternalUrl } from "@/lib/open-external-url";
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
import { useEffect, useState, type ReactNode } from "react";
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

const SATISFACTION_OPTIONS = [
  { value: 5, label: "とても満足" },
  { value: 4, label: "満足" },
  { value: 3, label: "普通" },
  { value: 2, label: "不満" },
  { value: 1, label: "とても不満" },
] as const;

export default function AccountDeletionScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuthContext();
  const [request, setRequest] = useState<Api.AccountDeletionRequest | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [requestType, setRequestType] = useState<"pause" | "withdrawal" | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [surveyComment, setSurveyComment] = useState("");
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [satisfactionReason, setSatisfactionReason] = useState("");
  const [valuedFeatures, setValuedFeatures] = useState<string[]>([]);
  const [continuationCondition, setContinuationCondition] = useState("");
  const [subscriptionConfirmed, setSubscriptionConfirmed] = useState(false);
  const [dataConfirmed, setDataConfirmed] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    Api.getAccountDeletionRequest()
      .then((result) => setRequest(result.request))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const performSubmission = async (type: "pause" | "withdrawal") => {
    setLoading(true);
    setFormError("");
    try {
      const result = await Api.requestAccountDeletion({
        password,
        requestType: type,
        reasons,
        surveyComment,
        satisfaction,
        satisfactionReason,
        valuedFeatures,
        continuationCondition,
        understandSquareChange: subscriptionConfirmed,
        understandDataHandling: dataConfirmed,
        source: Platform.OS === "web" ? "web" : "app",
      });
      setRequest(result.request);
      setPassword("");
      Alert.alert(
        "申請を受け付けました",
        type === "pause"
          ? "Squareの休止処理を予約しました。反映日はSquareの請求周期に従います。"
          : "Squareの解約処理と退会手続きを受け付けました。",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "もう一度お試しください。";
      if (Platform.OS === "web") setFormError(message);
      else Alert.alert("申請できませんでした", message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (loading) return;
    if (!requestType || !password || !subscriptionConfirmed || !dataConfirmed) {
      const missing = [
        !requestType && "手続きの種類",
        !password && "現在のパスワード",
        !subscriptionConfirmed && "Squareの定期決済に関する確認",
        !dataConfirmed && "退会後のデータに関する確認",
      ].filter(Boolean).join("、");
      const message = `${missing}を入力・確認してください。`;
      if (Platform.OS === "web") setFormError(message);
      else Alert.alert("入力内容を確認してください", message);
      return;
    }
    setFormError("");

    const title =
      requestType === "pause" ? "休会を申請しますか？" : "退会を申請しますか？";
    const message =
      requestType === "pause"
        ? "Squareの定期決済を休止する処理を行います。"
        : "Squareの定期決済を解約予約し、退会処理を開始します。";

    // React Native Web's multi-button Alert does not reliably invoke button
    // callbacks in iOS in-app browsers. Use the browser's native confirm so
    // the final action remains reachable on the public web app.
    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${message}`)) {
        await performSubmission(requestType);
      }
      return;
    }

    Alert.alert(
      title,
      message,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: requestType === "pause" ? "休会を申請する" : "退会を申請する",
          style: "destructive",
          onPress: () => void performSubmission(requestType),
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
    children: ReactNode;
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
          休会・退会手続き
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 56 }}>
        <Text
          style={{ fontSize: 14, lineHeight: 23, color: colors.foreground }}
        >
          アプリから休会または退会を申請できます。アンケート送信時に、サブスクリプション決済も自動で休止または解約予約します。
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
            手続き前にご確認ください
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 13,
              lineHeight: 21,
              color: colors.foreground,
            }}
          >
            ・休会はSquareのサブスクリプション決済を次回請求周期から休止します。退会は現在の請求期間終了時に解約されます。
            {"\n"}
            ・休会・退会とも、現在の決済期間が終了するとアプリへアクセスできなくなります。
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
              {request.requestType === "pause"
                ? "休会手続きは完了しています"
                : "退会手続きは完了しています"}
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
              {request.squareEffectiveDate
                ? `\nサブスク停止日：${formatDate(request.squareEffectiveDate)}`
                : ""}
              {request.requestType === "withdrawal" && request.squareEffectiveDate
                ? `\nアプリ利用期限：${formatDate(request.squareEffectiveDate)}`
                : ""}
            </Text>
            <Text style={{ marginTop: 12, fontSize: 13, lineHeight: 20, color: colors.foreground }}>
              {request.squareAction === "cancel_scheduled" && request.squareEffectiveDate
                ? `${formatDate(request.squareEffectiveDate)}まではアプリをご利用いただけます。Squareのサブスクリプションは解約予約済みのため、次回更新は行われません。`
                : request.requestType === "pause"
                  ? "Squareのサブスクリプション休止処理は予約済みです。反映日はSquareの請求周期に従います。"
                  : "Squareのサブスクリプション解約処理を受け付けています。"}
            </Text>
            <Text style={{ marginTop: 8, fontSize: 12, lineHeight: 19, color: colors.muted }}>
              プロフィールとログイン情報は退会処理に伴い削除されます。変更や取り消しは運営へお問い合わせください。
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 22 }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground, marginBottom: 9 }}>手続きの種類</Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 18 }}>{(["pause", "withdrawal"] as const).map((type) => <Pressable key={type} onPress={() => setRequestType(type)} style={{ flex: 1, minHeight: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: requestType === type ? "#C94F7C" : colors.surface, borderWidth: 1, borderColor: requestType === type ? "#C94F7C" : colors.border }}><Text style={{ fontSize: 15, fontWeight: "900", color: requestType === type ? "#FFF" : colors.foreground }}>{type === "pause" ? "休会" : "退会"}</Text></Pressable>)}</View>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>休会・退会理由（複数選択可）</Text>
            {['仕事や家庭の都合', '参加する時間が取れない', '費用を見直したい', '利用したい機能が少ない', 'その他'].map((reason) => <CheckRow key={reason} checked={reasons.includes(reason)} onPress={() => setReasons((current) => current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason])}>{reason}</CheckRow>)}
            <TextInput value={surveyComment} onChangeText={setSurveyComment} multiline placeholder="ご意見や再開条件など（任意）" placeholderTextColor={colors.muted} style={{ minHeight: 96, marginTop: 14, borderRadius: 13, borderWidth: 1, borderColor: colors.border, padding: 13, color: colors.foreground, textAlignVertical: "top" }} />
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground, marginTop: 20 }}>総合満足度</Text>
            <View style={{ gap: 8, marginTop: 10 }}>{SATISFACTION_OPTIONS.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: satisfaction === option.value }} onPress={() => setSatisfaction(option.value)} style={{ minHeight: 46, borderRadius: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", backgroundColor: satisfaction === option.value ? "#FBE8F0" : colors.surface, borderWidth: 1, borderColor: satisfaction === option.value ? "#C94F7C" : colors.border }}><View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: satisfaction === option.value ? "#C94F7C" : colors.border, alignItems: "center", justifyContent: "center" }}>{satisfaction === option.value ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#C94F7C" }} /> : null}</View><Text style={{ marginLeft: 10, fontSize: 14, fontWeight: "700", color: colors.foreground }}>{option.label}</Text></Pressable>)}</View>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground, marginTop: 20 }}>よろしければ上記の理由をお聞かせください。（任意）</Text>
            <TextInput value={satisfactionReason} onChangeText={setSatisfactionReason} multiline placeholder="理由を入力してください" placeholderTextColor={colors.muted} style={{ minHeight: 88, marginTop: 10, borderRadius: 13, borderWidth: 1, borderColor: colors.border, padding: 13, color: colors.foreground, textAlignVertical: "top" }} />
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground, marginTop: 20 }}>良かったサービス（複数選択可）</Text>
            {['公式イベント', 'グルメ会（メンバー主催）', '部活動', '会員限定クーポン', 'プレゼント企画', '共有グルメマップ', 'メンバー間の交流'].map((feature) => <CheckRow key={feature} checked={valuedFeatures.includes(feature)} onPress={() => setValuedFeatures((current) => current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature])}>{feature}</CheckRow>)}
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground, marginTop: 20 }}>どのような内容があれば継続・再開を検討しますか？（任意）</Text>
            <TextInput value={continuationCondition} onChangeText={setContinuationCondition} multiline placeholder="内容を入力してください" placeholderTextColor={colors.muted} style={{ minHeight: 88, marginTop: 10, borderRadius: 13, borderWidth: 1, borderColor: colors.border, padding: 13, color: colors.foreground, textAlignVertical: "top" }} />
            <Text
              style={{
                fontSize: 14,
                fontWeight: "900",
                color: colors.foreground,
                marginTop: 20,
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
              送信するとサブスクリプション決済が自動で{requestType === "pause" ? "休止予約" : "解約予約"}されることを確認しました。
            </CheckRow>
            <CheckRow
              checked={dataConfirmed}
              onPress={() => setDataConfirmed((value) => !value)}
            >
              {requestType === "pause" ? "決済期間終了後はアプリへアクセスできません。再開には運営への連絡が必要です。" : "決済期間終了後はアプリへアクセスできません。退会後は元に戻せず、必要な記録が一定期間保持される場合があります。"}
            </CheckRow>
            <Pressable
              onPress={() => void submit()}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={requestType === "pause" ? "休会を申請する" : "退会を申請する"}
              style={{
                minHeight: 52,
                marginTop: 22,
                borderRadius: 14,
                backgroundColor: "#C94F7C",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "900" }}
              >
                {requestType === "pause" ? "休会を申請する" : requestType === "withdrawal" ? "退会を申請する" : "手続きの種類を選択してください"}
              </Text>
            </Pressable>
            {formError ? <Text accessibilityRole="alert" style={{ marginTop: 10, fontSize: 13, lineHeight: 20, color: "#B42318" }}>{formError}</Text> : null}
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
          <Pressable onPress={() => void openExternalUrl(PRIVACY_POLICY_URL)}>
            <Text style={{ color: "#5B78A5", textDecorationLine: "underline" }}>
              プライバシーポリシー
            </Text>
          </Pressable>
          <Pressable onPress={() => void openExternalUrl(OFFICIAL_LINE_URL)}>
            <Text style={{ color: "#5B78A5", textDecorationLine: "underline" }}>
              運営へ問い合わせる
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
