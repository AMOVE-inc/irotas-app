import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";

const REPORT_URL = "https://discord.com/channels/1217327152098312245/1217830541064273992";
const COMMUNITY_TERMS_URL = "https://irotas-community.com/terms";
const EVENT_TERMS_URL = "https://irotas-community.com/event-terms";

const COMMUNITY_RULES = [
  "コミュニティ内では、年齢・性別・出身・職業を問わず、すべての人に思いやりと敬意を持って接しましょう。",
  "IRO+は「みんなで作る全員参加型コミュニティ」です。",
  "受け身にならず、自ら積極的に参加する姿勢で楽しみましょう。",
  "新しいメンバーを全員で温かく迎え入れましょう。",
  "メンバー全員にとって心地の良いコミュニティづくりを心がけましょう。",
] as const;

const PROHIBITED_ITEMS = [
  { title: "法令または公序良俗に反する行為", details: [] },
  {
    title: "他の会員または第三者に対する迷惑行為・ハラスメント",
    details: [
      "暴言、誹謗中傷、威嚇、ストーカー行為、執拗に連絡するなどの行為",
      "過度な飲酒による泥酔など、周囲に迷惑をかける行為",
    ],
  },
  {
    title: "営業・勧誘行為",
    details: [
      "マルチ商法、ネットワークビジネス、宗教、政治活動への勧誘",
      "当コミュニティの許可を得ていない宣伝、営業活動",
      "コミュニティ外のイベントなどへ執拗に勧誘する行為",
    ],
  },
  {
    title: "情報の漏洩・不正利用",
    details: [
      "会員限定コンテンツ（クーポン、グルメマップ、イベント情報等）を、SNSやブログ等を含む外部へ転載・流出させる行為",
      "他の会員のプライバシーに関する情報を、本人の承諾なく公開する行為",
    ],
  },
  {
    title: "運営の妨害",
    details: ["運営からの指示に従わない行為、または運営業務を著しく妨害する行為"],
  },
] as const;

const EVENT_RULES = [
  {
    title: "イベントの開催",
    items: [
      "全体イベントおよび支部イベントは運営主体で開催されます。会員主催のイベント（メンバー企画）は、会員同士の責任において実施されるものとします。",
    ],
  },
  {
    title: "キャンセル規定",
    items: [
      "参加申し込み完了後、イベント開催日の7日前以降に参加者の都合（体調不良、仕事、交通機関の遅延等を含む）によりキャンセルされる場合、参加費の100%をキャンセル料として頂戴します。",
      "事前にイベント主催者（幹事または運営事務局）へ連絡のうえ、当コミュニティ会員である別の方へ参加枠を譲渡できます。代理参加者が見つかり枠を譲渡できた場合、キャンセル料は発生しません。金銭の授受は当事者間で行うものとします。",
      "前日または当日のキャンセルには、キャンセル料とは別に1回につき1ペナルティポイントが付与されます。累積3ポイントに達した会員は、該当月から1か月間、すべてのイベントへの参加および新規申込ができません。ポイントの有効期限は付与日から3か月間です。",
    ],
  },
  {
    title: "キャンセル料の不払い",
    items: [
      "キャンセル料が発生した場合、会員はキャンセル日から1週間以内に支払うものとします。",
      "1週間以内に支払いが確認できない場合、当該会員を即時強制退会処分とし、法的措置を含めキャンセル料を請求します。",
    ],
  },
  {
    title: "肖像権の取り扱い",
    items: [
      "イベントの様子（写真・動画）は、コミュニティの活動記録および広報活動（公式SNS、Webサイト等）に利用する場合があります。",
      "顔出しを希望しない会員は、イベント参加前に必ず運営へ申告してください。",
      "事前の申告がない場合、撮影および公開に同意したものとみなします。",
    ],
  },
  {
    title: "免責",
    items: [
      "イベント内における会員間のトラブル、事故、盗難、怪我、食中毒、アレルギー反応等について、当コミュニティは一切の責任を負いません。",
    ],
  },
] as const;

function Bullet({ children, nested = false }: { children: string; nested?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", marginTop: nested ? 6 : 9, paddingLeft: nested ? 12 : 0 }}>
      <Text style={{ width: 16, fontSize: 14, lineHeight: 22, color: nested ? colors.muted : "#5B5A73" }}>{nested ? "–" : "•"}</Text>
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 22, color: colors.foreground }}>{children}</Text>
    </View>
  );
}

function LinkButton({ label, url }: { label: string; url: string }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ flex: 1, fontSize: 14, fontWeight: "800", color: "#5B5A73" }}>{label}</Text>
      <IconSymbol name="chevron.right" size={16} color="#5B5A73" />
    </Pressable>
  );
}

export default function CommunityRulesScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <ScreenContainer>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Pressable accessibilityLabel="戻る" onPress={() => router.back()} style={{ padding: 4, marginRight: 10 }}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>コミュニティルール</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 14, lineHeight: 22, color: colors.muted, marginBottom: 16 }}>
          すべての会員が安心して食と交流を楽しめるよう、参加前に内容をご確認ください。
        </Text>

        <View style={{ gap: 14 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground }}>基本ルール</Text>
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 4 }}>みんなで心地よいコミュニティを作るための約束です。</Text>
            <View style={{ marginTop: 4 }}>{COMMUNITY_RULES.map((rule) => <Bullet key={rule}>{rule}</Bullet>)}</View>
          </View>

          <View style={{ backgroundColor: "#FFF7F7", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#E8CACA" }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#8E3434" }}>禁止事項</Text>
            <View style={{ marginTop: 10, borderRadius: 12, backgroundColor: "#FBE8E8", padding: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: "900", lineHeight: 20, color: "#8E3434" }}>
                下記に該当する場合、即時イベント退場・退会処分とし、会費の返金は行いません。
              </Text>
            </View>
            <Text style={{ fontSize: 13, lineHeight: 20, color: colors.foreground, marginTop: 12 }}>
              該当する行為を見かけた場合は、速やかに運営へご連絡ください。
            </Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(REPORT_URL)}
              style={({ pressed }) => ({ alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, backgroundColor: "#5B5A73", opacity: pressed ? 0.75 : 1 })}
            >
              <Text style={{ fontSize: 13, fontWeight: "800", color: "#FFFFFF" }}>運営へ連絡する</Text>
            </Pressable>
            <View style={{ marginTop: 8 }}>
              {PROHIBITED_ITEMS.map((item) => (
                <View key={item.title} style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: "900", lineHeight: 21, color: colors.foreground }}>・{item.title}</Text>
                  {item.details.map((detail) => <Bullet key={detail} nested>{detail}</Bullet>)}
                </View>
              ))}
            </View>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground }}>イベント参加規約</Text>
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 4 }}>申し込み前に必ずご確認ください。</Text>
            {EVENT_RULES.map((section) => (
              <View key={section.title} style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>{section.title}</Text>
                {section.items.map((item) => <Bullet key={item}>{item}</Bullet>)}
              </View>
            ))}
          </View>

          <View style={{ backgroundColor: "#F4F3F7", borderRadius: 16, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground, marginBottom: 4 }}>規約全文</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: colors.muted, marginBottom: 12 }}>詳細は公式サイトの規約をご確認ください。</Text>
            <View style={{ gap: 8 }}>
              <LinkButton label="コミュニティ利用規約" url={COMMUNITY_TERMS_URL} />
              <LinkButton label="イベント参加規約" url={EVENT_TERMS_URL} />
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
