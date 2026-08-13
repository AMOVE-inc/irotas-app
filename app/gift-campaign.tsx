import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, RANK_COLORS, RANK_LABELS } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { applyForGift, getGiftApplications, getGiftCampaigns, type GiftCampaign, type GiftCategory } from "@/lib/gift-campaign-store";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";

const RANK_ORDER = { regular: 0, silver: 1, gold: 2, platinum: 3 };
const CATEGORY_LABELS: Record<GiftCategory, string> = { gourmet: "グルメ", non_gourmet: "グルメ以外" };

export default function GiftCampaignScreen() {
  const colors = useColors();
  const router = useRouter();
  const [category, setCategory] = useState<"all" | GiftCategory>("all");
  const [campaigns, setCampaigns] = useState<GiftCampaign[]>([]);
  const [appliedIds, setAppliedIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([getGiftCampaigns(), getGiftApplications()]).then(([items, applications]) => {
      setCampaigns(items);
      setAppliedIds(applications.filter((item) => item.memberId === CURRENT_USER.id).map((item) => item.campaignId));
    });
  }, []);

  const visibleCampaigns = useMemo(() => campaigns
    .filter((item) => category === "all" || item.category === category)
    .sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed") || a.deadline.localeCompare(b.deadline)), [campaigns, category]);

  const handleApply = (campaign: GiftCampaign) => {
    Alert.alert("抽選申込", `「${campaign.title}」の抽選に申し込みますか？`, [
      { text: "キャンセル", style: "cancel" },
      { text: "申し込む", onPress: async () => {
        await applyForGift(campaign.id, CURRENT_USER.id, CURRENT_USER.name);
        setAppliedIds((current) => [...new Set([...current, campaign.id])]);
        Alert.alert("申込完了", "抽選結果はお知らせでご案内します。");
      } },
    ]);
  };

  return <ScreenContainer edges={["top", "left", "right"]}>
    <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
      <Pressable onPress={() => router.back()}><IconSymbol name="arrow.left" size={22} color={colors.foreground} /></Pressable>
      <View style={{ marginLeft: 12 }}><Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>プレゼント企画</Text><Text style={{ fontSize: 12, color: colors.muted }}>会員限定の抽選キャンペーン</Text></View>
    </View>
    <View style={{ flexDirection: "row", gap: 8, padding: 16 }}>
      {([['all', 'すべて'], ['gourmet', 'グルメ'], ['non_gourmet', 'グルメ以外']] as const).map(([key, label]) => <Pressable key={key} onPress={() => setCategory(key)} style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, backgroundColor: category === key ? "#E8A0BF" : colors.surface }}><Text style={{ fontWeight: "700", color: category === key ? "#FFF" : colors.foreground }}>{label}</Text></Pressable>)}
    </View>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
      {visibleCampaigns.map((campaign) => {
        const closed = campaign.status === "closed";
        const applied = appliedIds.includes(campaign.id);
        const rankEligible = RANK_ORDER[CURRENT_USER.rank] >= RANK_ORDER[campaign.minimumRank];
        return <View key={campaign.id} style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 14, opacity: closed ? 0.45 : 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <View style={{ backgroundColor: "#E8A0BF20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: "#C55D8D", fontWeight: "700", fontSize: 11 }}>{CATEGORY_LABELS[campaign.category]}</Text></View>
            <View style={{ marginLeft: 6, backgroundColor: RANK_COLORS[campaign.minimumRank] + "25", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: RANK_COLORS[campaign.minimumRank], fontWeight: "700", fontSize: 11 }}>{RANK_LABELS[campaign.minimumRank]}以上</Text></View>
            <View style={{ marginLeft: "auto", backgroundColor: closed ? "#8E8E9325" : "#34C75920", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 4 }}><Text style={{ color: closed ? "#6E6E73" : "#248A3D", fontWeight: "800", fontSize: 11 }}>{closed ? "募集終了" : "募集中"}</Text></View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>{campaign.imageUrl ? <Image source={{ uri: campaign.imageUrl }} style={{ width: 104, height: 104, borderRadius: 13, marginRight: 12 }} contentFit="cover" /> : <Text style={{ fontSize: 34, marginRight: 12 }}>{campaign.imageEmoji}</Text>}<Text style={{ flex: 1, fontSize: 16, fontWeight: "800", color: colors.foreground }}>{campaign.title}</Text></View>
          <Text style={{ color: colors.muted, lineHeight: 20, marginVertical: 10 }}>{campaign.description}</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>応募期限：{campaign.deadline}　当選 {campaign.winnerCount}名</Text>
          <Pressable disabled={closed || applied || !rankEligible} onPress={() => handleApply(campaign)} style={{ alignItems: "center", paddingVertical: 11, borderRadius: 12, backgroundColor: applied ? "#34C75920" : !closed && rankEligible ? "#E8A0BF" : colors.border }}><Text style={{ fontWeight: "800", color: applied ? "#248A3D" : !closed && rankEligible ? "#FFF" : colors.muted }}>{applied ? "申込済み" : closed ? "募集終了" : rankEligible ? "抽選に申し込む" : `${RANK_LABELS[campaign.minimumRank]}以上が対象`}</Text></Pressable>
        </View>;
      })}
    </ScrollView>
  </ScreenContainer>;
}
