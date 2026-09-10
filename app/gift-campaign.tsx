import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, RANK_LABELS } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { applyForGift, getGiftApplications, getGiftCampaigns, type GiftCampaign } from "@/lib/gift-campaign-store";
import { isGiftCampaignOpen } from "@/lib/gift-campaign-status";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useAuthContext } from "@/lib/auth-context";

const RANK_ORDER = { regular: 0, silver: 1, gold: 2, platinum: 3 };
export default function GiftCampaignScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const memberId = authUser?.memberId ?? String(authUser?.id ?? CURRENT_USER.id);
  const memberName = authUser?.name ?? CURRENT_USER.name;
  const memberRank = (authUser?.memberRank ?? CURRENT_USER.rank) as keyof typeof RANK_ORDER;
  const [campaigns, setCampaigns] = useState<GiftCampaign[]>([]);
  const [appliedIds, setAppliedIds] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<GiftCampaign | null>(null);

  useEffect(() => {
    Promise.all([getGiftCampaigns(), getGiftApplications()]).then(([items, applications]) => {
      setCampaigns(items);
      setAppliedIds(applications.filter((item) => item.memberId === memberId).map((item) => item.campaignId));
    });
  }, [memberId]);

  const visibleCampaigns = useMemo(() => campaigns
    .sort((a, b) => Number(!isGiftCampaignOpen(a)) - Number(!isGiftCampaignOpen(b)) || a.deadline.localeCompare(b.deadline)), [campaigns]);

  const handleApply = (campaign: GiftCampaign) => {
    Alert.alert("抽選申込", `「${campaign.title}」の抽選に申し込みますか？`, [
      { text: "キャンセル", style: "cancel" },
      { text: "申し込む", onPress: async () => {
        await applyForGift(campaign.id, memberId, memberName);
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
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
      {visibleCampaigns.map((campaign) => {
        const closed = !isGiftCampaignOpen(campaign);
        return <Pressable onPress={() => setSelectedCampaign(campaign)} key={campaign.id} style={{ backgroundColor: closed ? "#F0F0F2" : colors.surface, borderRadius: 16, padding: 13, marginBottom: 10, opacity: closed ? 0.62 : 1, borderWidth: 1, borderColor: closed ? "#D4D4D8" : "transparent" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {campaign.imageUrl ? <Image source={{ uri: campaign.imageUrl }} style={{ width: 88, height: 88, borderRadius: 12, marginRight: 12 }} contentFit="cover" /> : <View style={{ width: 88, height: 88, borderRadius: 12, marginRight: 12, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 34 }}>{campaign.imageEmoji}</Text></View>}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 21, fontWeight: "800", color: colors.foreground }}>{campaign.title}</Text>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, marginTop: 7 }}>当選 {campaign.winnerCount}名</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>応募期限：{campaign.deadline}</Text>
            </View>
          </View>
          <Pressable onPress={(event) => { event.stopPropagation?.(); setSelectedCampaign(campaign); }} style={{ alignItems: "center", paddingVertical: 10, marginTop: 11, borderRadius: 11, backgroundColor: closed ? colors.border : "#E8A0BF" }}><Text style={{ fontWeight: "800", color: closed ? colors.muted : "#FFF" }}>{closed ? "詳細を見る" : "抽選に申し込む"}</Text></Pressable>
        </Pressable>;
      })}
    </ScrollView>
    <Modal visible={selectedCampaign !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedCampaign(null)}>{selectedCampaign ? (() => { const open = isGiftCampaignOpen(selectedCampaign); return <View style={{ flex: 1, backgroundColor: colors.background }}><View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 19, fontWeight: "900", color: colors.foreground }}>プレゼント企画詳細</Text><Pressable onPress={() => setSelectedCampaign(null)}><IconSymbol name="xmark" size={22} color={colors.foreground} /></Pressable></View><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>{selectedCampaign.imageUrl ? <Image source={{ uri: selectedCampaign.imageUrl }} style={{ width: "100%", aspectRatio: 1, borderRadius: 18, opacity: open ? 1 : 0.55 }} contentFit="cover" /> : <Text style={{ fontSize: 68, textAlign: "center", marginVertical: 30 }}>{selectedCampaign.imageEmoji}</Text>}<View style={{ alignSelf: "flex-start", marginTop: 16, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: open ? "#DFF4E6" : "#E1E1E4" }}><Text style={{ fontSize: 11, fontWeight: "900", color: open ? "#247A42" : colors.muted }}>{open ? "募集中" : "募集終了"}</Text></View><Text style={{ fontSize: 23, lineHeight: 31, fontWeight: "900", color: colors.foreground, marginTop: 12 }}>{selectedCampaign.title}</Text><Text style={{ fontSize: 14, lineHeight: 22, color: colors.foreground, marginTop: 14 }}>{selectedCampaign.description}</Text><Text style={{ fontSize: 12, color: colors.muted, marginTop: 18 }}>応募期限：{selectedCampaign.deadline} ／ 当選 {selectedCampaign.winnerCount}名</Text><Text style={{ fontSize: 12, color: colors.muted, marginTop: 5 }}>対象：{RANK_LABELS[selectedCampaign.minimumRank]}会員以上</Text>{selectedCampaign.archivedFromDiscord ? <Text style={{ fontSize: 11, color: colors.muted, marginTop: 7 }}>Discordから移行した終了済み企画です</Text> : null}{open ? <Pressable disabled={appliedIds.includes(selectedCampaign.id) || RANK_ORDER[memberRank] < RANK_ORDER[selectedCampaign.minimumRank]} onPress={() => handleApply(selectedCampaign)} style={{ marginTop: 24, minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: appliedIds.includes(selectedCampaign.id) ? "#34C75920" : RANK_ORDER[memberRank] >= RANK_ORDER[selectedCampaign.minimumRank] ? "#E8A0BF" : colors.border }}><Text style={{ fontSize: 15, fontWeight: "900", color: appliedIds.includes(selectedCampaign.id) ? "#248A3D" : RANK_ORDER[memberRank] >= RANK_ORDER[selectedCampaign.minimumRank] ? "#FFF" : colors.muted }}>{appliedIds.includes(selectedCampaign.id) ? "申込済み" : RANK_ORDER[memberRank] >= RANK_ORDER[selectedCampaign.minimumRank] ? "抽選に申し込む" : `${RANK_LABELS[selectedCampaign.minimumRank]}以上が対象`}</Text></Pressable> : null}</ScrollView></View>; })() : null}</Modal>
  </ScreenContainer>;
}
