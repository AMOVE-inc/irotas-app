import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

const CAMPAIGNS = [
  {
    id: "organizer-support",
    title: "幹事応援キャンペーン",
    description: "メンバー主催のグルメ会を応援するキャンペーンです。イベントを開催完了すると、幹事へ20ptを付与します。イベントがキャンセルされた場合、幹事ポイントは取り消されます。",
    note: "対象：全会員／開催完了したグルメ会",
    icon: "person.3.fill",
    color: "#E8A0BF",
  },
  {
    id: "friend-invitation",
    title: "友人招待キャンペーン",
    description: "IRO+を一緒に楽しみたいご友人をご紹介ください。紹介された方の入会手続き・決済完了後、運営からキャンペーン特典をご案内します。",
    note: "対象：全会員／紹介された方の入会完了が条件",
    icon: "person.badge.plus",
    color: "#A7C7E7",
  },
] as const;

export default function CampaignsScreen() {
  const colors = useColors();
  const router = useRouter();
  return <ScreenContainer edges={["top", "left", "right"]}>
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
      <Pressable accessibilityLabel="戻る" onPress={() => router.back()}><IconSymbol name="arrow.left" size={22} color={colors.foreground} /></Pressable>
      <View style={{ marginLeft: 12 }}><Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>キャンペーン</Text><Text style={{ fontSize: 12, color: colors.muted }}>IRO+をもっと楽しむための企画</Text></View>
    </View>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {CAMPAIGNS.map((campaign) => <View key={campaign.id} style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 17, marginBottom: 14, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: campaign.color + "22", alignItems: "center", justifyContent: "center" }}><IconSymbol name={campaign.icon} size={23} color={campaign.color} /></View>
          <View style={{ flex: 1, marginLeft: 12 }}><Text style={{ fontSize: 17, fontWeight: "900", color: colors.foreground }}>{campaign.title}</Text><View style={{ alignSelf: "flex-start", marginTop: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#34C75920" }}><Text style={{ fontSize: 10, fontWeight: "800", color: "#248A3D" }}>実施中</Text></View></View>
        </View>
        <Text style={{ fontSize: 14, lineHeight: 22, color: colors.foreground, marginTop: 14 }}>{campaign.description}</Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 11 }}>{campaign.note}</Text>
      </View>)}
    </ScrollView>
  </ScreenContainer>;
}
