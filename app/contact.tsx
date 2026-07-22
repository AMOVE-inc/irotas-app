import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { OFFICIAL_LINE_URL, REPORT_FORM_URL } from "@/constants/external-links";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";

const REPORT_EXAMPLES = [
  "他の会員から不快な言動を受けた",
  "イベントでのマナーが気になった（ドタキャン・遅刻・飲食マナー等）",
  "勧誘・金銭トラブルに巻き込まれた",
  "運営に相談したいことがある",
] as const;

async function openExternalUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("リンクを開けませんでした", "時間をおいて、もう一度お試しください。");
  }
}

function ContactButton({ label, url, color }: { label: string; url: string; color: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void openExternalUrl(url)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 13, backgroundColor: color, paddingHorizontal: 16, opacity: pressed ? 0.75 : 1 })}
    >
      <Text style={{ fontSize: 15, fontWeight: "900", color: "#FFFFFF" }}>{label}</Text>
      <IconSymbol name="chevron.right" size={17} color="#FFFFFF" />
    </Pressable>
  );
}

export default function ContactScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <ScreenContainer>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Pressable accessibilityLabel="戻る" onPress={() => router.back()} style={{ padding: 4, marginRight: 10 }}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>お問い合わせ</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 14, lineHeight: 22, color: colors.foreground }}>
          いつもIRO+をご利用いただきありがとうございます。皆様が安心してコミュニティを楽しめるよう、内容に応じた窓口をご用意しています。
        </Text>

        <View style={{ marginTop: 18, backgroundColor: "#FFF7F7", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#E8CACA" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F5DDDD", alignItems: "center", justifyContent: "center" }}>
              <IconSymbol name="exclamationmark.circle.fill" size={20} color="#A34A4A" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground }}>相談・通報窓口</Text>
              <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 2 }}>会員間やイベントでのトラブルはこちら</Text>
            </View>
          </View>

          <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground, marginTop: 18 }}>こんなときにご利用ください</Text>
          <View style={{ marginTop: 4 }}>
            {REPORT_EXAMPLES.map((item) => (
              <View key={item} style={{ flexDirection: "row", marginTop: 8 }}>
                <Text style={{ width: 18, fontSize: 14, lineHeight: 21, color: "#A34A4A" }}>•</Text>
                <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: colors.foreground }}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={{ marginTop: 16, backgroundColor: colors.background, borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>匿名でも相談できます</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 4 }}>お名前を明かしたくない場合は、フォームで「匿名で送る」を選択してください。</Text>
          </View>

          <View style={{ marginTop: 14 }}>
            <ContactButton label="相談・通報フォームを開く" url={REPORT_FORM_URL} color="#9A4747" />
          </View>
          <Text style={{ fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 12 }}>
            ルール違反に当たる行為や注意喚起が繰り返される場合は、コミュニティ規約に則り適切に対処します。
          </Text>
        </View>

        <View style={{ marginTop: 14, backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#06C75518", alignItems: "center", justifyContent: "center" }}>
              <IconSymbol name="message.fill" size={20} color="#06A846" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground }}>その他のお問い合わせ</Text>
              <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 2 }}>公式LINEで個別に対応します</Text>
            </View>
          </View>
          <Text style={{ fontSize: 14, lineHeight: 22, color: colors.foreground, marginTop: 14 }}>
            その他、運営事務局へのお問い合わせは公式LINEからお願いします。順番に個別対応するため、返信にお時間をいただく場合があります。
          </Text>
          <View style={{ marginTop: 14 }}>
            <ContactButton label="公式LINEで問い合わせる" url={OFFICIAL_LINE_URL} color="#06A846" />
          </View>
        </View>

        <Text style={{ fontSize: 13, fontWeight: "800", color: colors.muted, textAlign: "center", marginTop: 22 }}>IRO+ 運営事務局</Text>
      </ScrollView>
    </ScreenContainer>
  );
}
