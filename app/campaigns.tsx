import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useCampaigns } from "@/lib/campaign-store";
import { parseLinkedText } from "@/lib/coupon-description";
import { useRouter } from "expo-router";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";

const TYPE_META = {
  points: { icon: "star.fill", color: "#E8A0BF" }, event: { icon: "calendar", color: "#A7C7E7" }, gift: { icon: "gift.fill", color: "#FF9500" }, notification: { icon: "megaphone.fill", color: "#AF52DE" },
} as const;
const RANK_LABEL = { all: "全会員", silver: "シルバー以上", gold: "ゴールド以上", platinum: "プラチナ" };

function CampaignDescription({ description, color }: { description: string; color: string }) {
  return (
    <Text style={{ fontSize: 14, lineHeight: 22, color, marginTop: 14 }}>
      {parseLinkedText(description).map((part, index) => (
        <Text
          key={`${index}-${part.text}`}
          accessibilityRole={part.url ? "link" : undefined}
          onPress={part.url ? () => { void Linking.openURL(part.url!).catch(() => Alert.alert("リンクを開けませんでした")); } : undefined}
          style={{ color: part.url ? "#3478C7" : color, textDecorationLine: part.url ? "underline" : "none" }}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

export default function CampaignsScreen() {
  const colors = useColors();
  const router = useRouter();
  const campaigns = useCampaigns().filter((item) => item.status !== "ended").sort((a, b) => a.startDate.localeCompare(b.startDate));
  return <ScreenContainer edges={["top", "left", "right"]}>
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Pressable accessibilityLabel="戻る" onPress={() => router.back()}><IconSymbol name="arrow.left" size={22} color={colors.foreground} /></Pressable><View style={{ marginLeft: 12 }}><Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>キャンペーン</Text><Text style={{ fontSize: 12, color: colors.muted }}>IRO+をもっと楽しむための企画</Text></View></View>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {campaigns.map((campaign) => { const meta = TYPE_META[campaign.type]; return <View key={campaign.id} style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 17, marginBottom: 14, borderWidth: 1, borderColor: colors.border }}><View style={{ flexDirection: "row", alignItems: "center" }}><View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: meta.color + "22", alignItems: "center", justifyContent: "center" }}><IconSymbol name={meta.icon} size={23} color={meta.color} /></View><View style={{ flex: 1, marginLeft: 12 }}><Text style={{ fontSize: 17, fontWeight: "900", color: colors.foreground }}>{campaign.title}</Text><View style={{ alignSelf: "flex-start", marginTop: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: campaign.status === "active" ? "#34C75920" : "#A7C7E730" }}><Text style={{ fontSize: 10, fontWeight: "800", color: campaign.status === "active" ? "#248A3D" : "#507A9A" }}>{campaign.status === "active" ? "実施中" : "開催予定"}</Text></View></View></View><CampaignDescription description={campaign.description} color={colors.foreground} /><Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 11 }}>対象：{RANK_LABEL[campaign.targetRank]} ／ {campaign.startDate}〜{campaign.endDate}</Text></View>; })}
      {campaigns.length === 0 ? <Text style={{ textAlign: "center", color: colors.muted, marginTop: 40 }}>現在実施中のキャンペーンはありません</Text> : null}
    </ScrollView>
  </ScreenContainer>;
}
