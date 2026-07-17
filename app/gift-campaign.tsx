import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, RANK_LABELS, RANK_COLORS } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

interface GiftItem {
  id: string;
  title: string;
  description: string;
  requiredPoints: number;
  requiredRank: "regular" | "silver" | "gold" | "platinum";
  category: "dining" | "experience" | "goods" | "travel";
  stock: number;
  expiresAt: string;
  imageEmoji: string;
}

const GIFTS: GiftItem[] = [
  {
    id: "g1",
    title: "高級レストランペアディナー券",
    description: "都内一流レストランでのペアディナーをプレゼント。シェフのおまかせコースをご堪能ください。",
    requiredPoints: 5000,
    requiredRank: "gold",
    category: "dining",
    stock: 3,
    expiresAt: "2026-04-30",
    imageEmoji: "🍽️",
  },
  {
    id: "g2",
    title: "ワインセット（3本）",
    description: "ソムリエ厳選のボルドー・ブルゴーニュ・シャンパーニュの3本セット。",
    requiredPoints: 3000,
    requiredRank: "silver",
    category: "goods",
    stock: 5,
    expiresAt: "2026-04-30",
    imageEmoji: "🍷",
  },
  {
    id: "g3",
    title: "温泉旅行ペアチケット",
    description: "箱根・熱海・草津から選べる1泊2日の温泉旅行。夕食・朝食付き。",
    requiredPoints: 8000,
    requiredRank: "platinum",
    category: "travel",
    stock: 2,
    expiresAt: "2026-06-30",
    imageEmoji: "♨️",
  },
  {
    id: "g4",
    title: "料理教室体験チケット",
    description: "有名シェフが直接指導する料理教室への参加権。フレンチ・イタリアン・和食から選択可。",
    requiredPoints: 2000,
    requiredRank: "regular",
    category: "experience",
    stock: 8,
    expiresAt: "2026-05-31",
    imageEmoji: "👨‍🍳",
  },
  {
    id: "g5",
    title: "IRO＋オリジナルグッズセット",
    description: "IRO＋ロゴ入りトートバッグ・タンブラー・ノートのセット。",
    requiredPoints: 1000,
    requiredRank: "regular",
    category: "goods",
    stock: 20,
    expiresAt: "2026-04-30",
    imageEmoji: "🎁",
  },
  {
    id: "g6",
    title: "プライベートワイン会招待",
    description: "会員限定のプライベートワイン会へご招待。ソムリエによる解説付き。",
    requiredPoints: 4000,
    requiredRank: "gold",
    category: "experience",
    stock: 6,
    expiresAt: "2026-05-31",
    imageEmoji: "🥂",
  },
];

const CATEGORY_LABELS = {
  dining: "グルメ",
  experience: "体験",
  goods: "グッズ",
  travel: "旅行",
};

const CATEGORY_COLORS = {
  dining: "#E8A0BF",
  experience: "#A7C7E7",
  goods: "#FF9500",
  travel: "#34C759",
};

const RANK_ORDER = { regular: 0, silver: 1, gold: 2, platinum: 3 };

export default function GiftCampaignScreen() {
  const colors = useColors();
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [appliedIds, setAppliedIds] = useState<string[]>([]);

  const userRankOrder = RANK_ORDER[CURRENT_USER.rank];
  const userPoints = CURRENT_USER.points;

  const filteredGifts =
    activeCategory === "all"
      ? GIFTS
      : GIFTS.filter((g) => g.category === activeCategory);

  const canApply = (gift: GiftItem) => {
    return (
      userPoints >= gift.requiredPoints &&
      userRankOrder >= RANK_ORDER[gift.requiredRank] &&
      gift.stock > 0 &&
      !appliedIds.includes(gift.id)
    );
  };

  const handleApply = (gift: GiftItem) => {
    if (!canApply(gift)) return;
    Alert.alert(
      "プレゼント応募",
      `「${gift.title}」に応募しますか？\n必要ポイント: ${gift.requiredPoints.toLocaleString()}pt`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "応募する",
          onPress: () => {
            setAppliedIds([...appliedIds, gift.id]);
            Alert.alert(
              "応募完了！",
              "応募を受け付けました。抽選結果はメッセージでお知らせします。",
            );
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
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
        <Pressable onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ marginLeft: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>
            プレゼント企画
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            ポイントを使って豪華プレゼントに応募
          </Text>
        </View>
      </View>

      {/* ポイント残高バナー */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#E8A0BF10",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: colors.muted }}>保有ポイント</Text>
          <Text style={{ fontSize: 24, fontWeight: "800", color: "#E8A0BF" }}>
            {userPoints.toLocaleString()} pt
          </Text>
        </View>
        <View
          style={{
            backgroundColor: RANK_COLORS[CURRENT_USER.rank] + "20",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: RANK_COLORS[CURRENT_USER.rank] }}>
            {RANK_LABELS[CURRENT_USER.rank]}
          </Text>
        </View>
      </View>

      {/* カテゴリフィルター */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: "center" }}
        style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border }}
      >
        {/* 「すべて」ボタン */}
        <Pressable
          onPress={() => setActiveCategory("all")}
          style={{
            width: 64,
            height: 36,
            borderRadius: 18,
            backgroundColor: activeCategory === "all" ? "#E8A0BF" : colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: activeCategory === "all" ? "#FFF" : colors.foreground }}>
            すべて
          </Text>
        </Pressable>
        {/* 各カテゴリボタン */}
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setActiveCategory(key)}
            style={{
              width: 64,
              height: 36,
              borderRadius: 18,
              backgroundColor:
                activeCategory === key
                  ? CATEGORY_COLORS[key as keyof typeof CATEGORY_COLORS]
                  : colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: activeCategory === key ? "#FFF" : colors.foreground,
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {filteredGifts.map((gift) => {
          const eligible = canApply(gift);
          const applied = appliedIds.includes(gift.id);
          const notEnoughPoints = userPoints < gift.requiredPoints;
          const notEnoughRank = userRankOrder < RANK_ORDER[gift.requiredRank];
          const catColor = CATEGORY_COLORS[gift.category];

          return (
            <View
              key={gift.id}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                padding: 16,
                marginBottom: 14,
                opacity: gift.stock === 0 ? 0.6 : 1,
              }}
            >
              {/* カテゴリ + 残数 */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                <View
                  style={{
                    backgroundColor: catColor + "20",
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: catColor }}>
                    {CATEGORY_LABELS[gift.category]}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: RANK_COLORS[gift.requiredRank] + "20",
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    marginLeft: 6,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: RANK_COLORS[gift.requiredRank] }}>
                    {RANK_LABELS[gift.requiredRank]}以上
                  </Text>
                </View>
                <Text style={{ flex: 1, fontSize: 11, color: colors.muted, textAlign: "right" }}>
                  残り{gift.stock}個
                </Text>
              </View>

              {/* アイコン + タイトル */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ fontSize: 36, marginRight: 12 }}>{gift.imageEmoji}</Text>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                  {gift.title}
                </Text>
              </View>

              {/* 説明 */}
              <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20, marginBottom: 12 }}>
                {gift.description}
              </Text>

              {/* 必要ポイント + 応募ボタン */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: colors.muted }}>必要ポイント</Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: "#E8A0BF" }}>
                    {gift.requiredPoints.toLocaleString()} pt
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleApply(gift)}
                  disabled={!eligible}
                  style={({ pressed }) => ({
                    backgroundColor: applied
                      ? "#34C75920"
                      : eligible
                      ? "#E8A0BF"
                      : colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: applied ? "#34C759" : eligible ? "#FFF" : colors.muted,
                    }}
                  >
                    {applied
                      ? "応募済み"
                      : gift.stock === 0
                      ? "在庫なし"
                      : notEnoughRank
                      ? `${RANK_LABELS[gift.requiredRank]}以上`
                      : notEnoughPoints
                      ? "ポイント不足"
                      : "応募する"}
                  </Text>
                </Pressable>
              </View>

              {/* 期限 */}
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>
                応募期限: {gift.expiresAt}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}
