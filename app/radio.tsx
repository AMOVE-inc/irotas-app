import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
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

interface RadioEpisode {
  id: string;
  title: string;
  description: string;
  duration: string;
  publishedAt: string;
  isNew?: boolean;
  category: "gourmet" | "lifestyle" | "member" | "event";
}

const EPISODES: RadioEpisode[] = [
  {
    id: "r1",
    title: "第12回 今月の絶品グルメ特集",
    description: "今月メンバーが発掘した隠れ家レストランを紹介。恵比寿のイタリアンから大阪の老舗まで。",
    duration: "28:34",
    publishedAt: "2026-03-28",
    isNew: true,
    category: "gourmet",
  },
  {
    id: "r2",
    title: "第11回 プラチナ会員への道",
    description: "ポイントを効率よく貯めるコツ、イベント参加のメリットをゴールド会員のさくらさんに聞きました。",
    duration: "22:10",
    publishedAt: "2026-03-21",
    isNew: true,
    category: "member",
  },
  {
    id: "r3",
    title: "第10回 2周年記念パーティー直前特集",
    description: "4月26日開催のIRO＋2周年パーティーの見どころを運営メンバーが語る！",
    duration: "35:00",
    publishedAt: "2026-03-14",
    category: "event",
  },
  {
    id: "r4",
    title: "第9回 焼肉の流儀",
    description: "A5和牛の正しい焼き方から、タレ vs 塩の論争まで。焼肉部のエキスパートが解説。",
    duration: "31:45",
    publishedAt: "2026-03-07",
    category: "gourmet",
  },
  {
    id: "r5",
    title: "第8回 ワインと料理のペアリング入門",
    description: "ワイン部部長のさくらさんが、初心者でも分かるペアリングの基本を丁寧に解説します。",
    duration: "26:20",
    publishedAt: "2026-02-28",
    category: "lifestyle",
  },
  {
    id: "r6",
    title: "第7回 関西グルメ巡り報告",
    description: "先月の関西グルメツアーの様子をレポート。道頓堀から心斎橋まで食べ歩いた記録。",
    duration: "19:55",
    publishedAt: "2026-02-21",
    category: "event",
  },
];

const CATEGORY_LABELS = {
  gourmet: "グルメ",
  lifestyle: "ライフスタイル",
  member: "会員インタビュー",
  event: "イベント",
};

const CATEGORY_COLORS = {
  gourmet: "#E8A0BF",
  lifestyle: "#A7C7E7",
  member: "#34C759",
  event: "#FF9500",
};

export default function RadioScreen() {
  const colors = useColors();
  const router = useRouter();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filteredEpisodes =
    activeCategory === "all"
      ? EPISODES
      : EPISODES.filter((e) => e.category === activeCategory);

  const handlePlay = (episode: RadioEpisode) => {
    if (playingId === episode.id) {
      setPlayingId(null);
    } else {
      setPlayingId(episode.id);
      Alert.alert(
        "再生開始",
        `「${episode.title}」を再生します。\n（実機では音声が流れます）`,
        [{ text: "OK" }],
      );
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
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
            IRO＋ラジオ
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            グルメ・ライフスタイルを語るポッドキャスト
          </Text>
        </View>
      </View>

      {/* 現在再生中バナー */}
      {playingId && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#E8A0BF",
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <IconSymbol name="waveform" size={18} color="#FFF" />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: "#FFF", marginLeft: 10 }} numberOfLines={1}>
            {EPISODES.find((e) => e.id === playingId)?.title}
          </Text>
          <Pressable onPress={() => setPlayingId(null)}>
            <IconSymbol name="stop.fill" size={18} color="#FFF" />
          </Pressable>
        </View>
      )}

      {/* カテゴリフィルター */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 8,
          flexDirection: "row",
          alignItems: "center",
        }}
        style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border, flexGrow: 0 }}
      >
        {[{ key: "all", label: "すべて", color: "#E8A0BF" }, ...Object.entries(CATEGORY_LABELS).map(([k, l]) => ({ key: k, label: l, color: CATEGORY_COLORS[k as keyof typeof CATEGORY_COLORS] }))].map((item) => {
          const isActive = activeCategory === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setActiveCategory(item.key)}
              style={{
                height: 36,
                paddingHorizontal: 16,
                borderRadius: 18,
                backgroundColor: isActive ? item.color : colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: isActive ? "#FFF" : colors.foreground,
                  lineHeight: 18,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {filteredEpisodes.map((episode) => {
          const isPlaying = playingId === episode.id;
          const catColor = CATEGORY_COLORS[episode.category];

          return (
            <View
              key={episode.id}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                padding: 16,
                marginBottom: 12,
                borderWidth: isPlaying ? 1.5 : 0,
                borderColor: isPlaying ? "#E8A0BF" : "transparent",
              }}
            >
              {/* カテゴリ + NEW バッジ */}
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
                    {CATEGORY_LABELS[episode.category]}
                  </Text>
                </View>
                {episode.isNew && (
                  <View
                    style={{
                      backgroundColor: "#E8A0BF",
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      marginLeft: 6,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFF" }}>NEW</Text>
                  </View>
                )}
                <Text style={{ flex: 1, fontSize: 11, color: colors.muted, textAlign: "right" }}>
                  {formatDate(episode.publishedAt)}
                </Text>
              </View>

              {/* タイトル */}
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>
                {episode.title}
              </Text>

              {/* 説明 */}
              <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20, marginBottom: 12 }} numberOfLines={2}>
                {episode.description}
              </Text>

              {/* 再生コントロール */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Pressable
                  onPress={() => handlePlay(episode)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: isPlaying ? "#E8A0BF" : "#E8A0BF20",
                    borderRadius: 20,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <IconSymbol
                    name={isPlaying ? "pause.fill" : "play.fill"}
                    size={16}
                    color={isPlaying ? "#FFF" : "#E8A0BF"}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: isPlaying ? "#FFF" : "#E8A0BF",
                      marginLeft: 6,
                    }}
                  >
                    {isPlaying ? "一時停止" : "再生"}
                  </Text>
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 12 }}>
                  <IconSymbol name="clock.fill" size={13} color={colors.muted} />
                  <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 4 }}>
                    {episode.duration}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}
