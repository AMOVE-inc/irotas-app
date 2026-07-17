import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, isAdmin } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

interface Campaign {
  id: string;
  title: string;
  description: string;
  targetRank: "all" | "silver" | "gold" | "platinum";
  startDate: string;
  endDate: string;
  status: "active" | "scheduled" | "ended";
  type: "points" | "event" | "gift" | "notification";
  reachCount: number;
}

const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: "c1",
    title: "春のポイント2倍キャンペーン",
    description: "4月中のイベント参加でポイントが2倍！",
    targetRank: "all",
    startDate: "2026-04-01",
    endDate: "2026-04-30",
    status: "active",
    type: "points",
    reachCount: 1240,
  },
  {
    id: "c2",
    title: "ゴールド会員限定ランチ会",
    description: "ゴールド以上の会員様を対象とした特別ランチ会のご案内",
    targetRank: "gold",
    startDate: "2026-04-15",
    endDate: "2026-04-15",
    status: "scheduled",
    type: "event",
    reachCount: 320,
  },
  {
    id: "c3",
    title: "2周年記念プレゼント抽選",
    description: "IRO＋2周年を記念した豪華プレゼント抽選キャンペーン",
    targetRank: "all",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    status: "ended",
    type: "gift",
    reachCount: 1580,
  },
];

const STATUS_LABELS = { active: "実施中", scheduled: "予定", ended: "終了" };
const STATUS_COLORS = { active: "#34C759", scheduled: "#A7C7E7", ended: "#8E8E93" };
const TYPE_LABELS = { points: "ポイント", event: "イベント", gift: "プレゼント", notification: "通知" };
const TYPE_COLORS = { points: "#E8A0BF", event: "#A7C7E7", gift: "#FF9500", notification: "#AF52DE" };
const RANK_LABELS_MAP = { all: "全会員", silver: "シルバー以上", gold: "ゴールド以上", platinum: "プラチナ" };

export default function CampaignManagerScreen() {
  const colors = useColors();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>(INITIAL_CAMPAIGNS);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<Campaign["type"]>("points");
  const [newRank, setNewRank] = useState<Campaign["targetRank"]>("all");

  if (!isAdmin(CURRENT_USER)) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ fontSize: 16, color: colors.muted, textAlign: "center", marginTop: 40 }}>
          管理者のみアクセスできます
        </Text>
      </ScreenContainer>
    );
  }

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    const today = new Date().toISOString().split("T")[0];
    const newCampaign: Campaign = {
      id: `c_${Date.now()}`,
      title: newTitle.trim(),
      description: newDesc.trim(),
      targetRank: newRank,
      startDate: today,
      endDate: today,
      status: "active",
      type: newType,
      reachCount: 0,
    };
    setCampaigns([newCampaign, ...campaigns]);
    setShowCreate(false);
    setNewTitle("");
    setNewDesc("");
    Alert.alert("作成完了", "キャンペーンを作成しました。");
  };

  const handleToggleStatus = (campaign: Campaign) => {
    if (campaign.status === "ended") return;
    const next = campaign.status === "active" ? "ended" : "active";
    setCampaigns(campaigns.map((c) => (c.id === campaign.id ? { ...c, status: next } : c)));
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
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, marginLeft: 12, flex: 1 }}>
          キャンペーン管理
        </Text>
        <Pressable
          onPress={() => setShowCreate(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#E8A0BF",
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <IconSymbol name="plus" size={14} color="#FFF" />
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFF", marginLeft: 4 }}>作成</Text>
        </Pressable>
      </View>

      {/* サマリー */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 10,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        {[
          { label: "実施中", count: campaigns.filter((c) => c.status === "active").length, color: "#34C759" },
          { label: "予定", count: campaigns.filter((c) => c.status === "scheduled").length, color: "#A7C7E7" },
          { label: "終了", count: campaigns.filter((c) => c.status === "ended").length, color: "#8E8E93" },
        ].map((s) => (
          <View
            key={s.label}
            style={{
              flex: 1,
              backgroundColor: s.color + "15",
              borderRadius: 12,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 22, fontWeight: "800", color: s.color }}>{s.count}</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{s.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {campaigns.map((campaign) => (
          <View
            key={campaign.id}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 16,
              marginBottom: 12,
            }}
          >
            {/* バッジ行 */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 6 }}>
              <View
                style={{
                  backgroundColor: TYPE_COLORS[campaign.type] + "20",
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: TYPE_COLORS[campaign.type] }}>
                  {TYPE_LABELS[campaign.type]}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: STATUS_COLORS[campaign.status] + "20",
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: STATUS_COLORS[campaign.status] }}>
                  {STATUS_LABELS[campaign.status]}
                </Text>
              </View>
              <Text style={{ flex: 1, fontSize: 11, color: colors.muted, textAlign: "right" }}>
                対象: {RANK_LABELS_MAP[campaign.targetRank]}
              </Text>
            </View>

            {/* タイトル */}
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>
              {campaign.title}
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20, marginBottom: 12 }}>
              {campaign.description}
            </Text>

            {/* 期間 + リーチ */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {campaign.startDate} 〜 {campaign.endDate}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <IconSymbol name="person.2.fill" size={13} color={colors.muted} />
                <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 4 }}>
                  {campaign.reachCount.toLocaleString()}名にリーチ
                </Text>
              </View>
            </View>

            {/* アクションボタン */}
            {campaign.status !== "ended" && (
              <Pressable
                onPress={() => handleToggleStatus(campaign)}
                style={({ pressed }) => ({
                  backgroundColor:
                    campaign.status === "active" ? "#FF3B3020" : "#34C75920",
                  borderRadius: 10,
                  paddingVertical: 8,
                  alignItems: "center",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: campaign.status === "active" ? "#FF3B30" : "#34C759",
                  }}
                >
                  {campaign.status === "active" ? "キャンペーンを終了する" : "キャンペーンを開始する"}
                </Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>

      {/* 作成モーダル */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowCreate(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <Pressable onPress={() => setShowCreate(false)}>
              <Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text>
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>キャンペーン作成</Text>
            <Pressable onPress={handleCreate}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: newTitle.trim() ? "#E8A0BF" : colors.muted }}>
                作成
              </Text>
            </Pressable>
          </View>

          <ScrollView>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>タイトル</Text>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="キャンペーン名を入力"
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: colors.foreground,
                marginBottom: 16,
              }}
            />

            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>説明</Text>
            <TextInput
              value={newDesc}
              onChangeText={setNewDesc}
              placeholder="キャンペーンの内容を入力"
              placeholderTextColor={colors.muted}
              multiline
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: colors.foreground,
                minHeight: 80,
                marginBottom: 16,
              }}
            />

            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>種別</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {(Object.entries(TYPE_LABELS) as [Campaign["type"], string][]).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setNewType(key)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: newType === key ? TYPE_COLORS[key] : colors.surface,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: newType === key ? "#FFF" : colors.foreground }}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>対象ランク</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(Object.entries(RANK_LABELS_MAP) as [Campaign["targetRank"], string][]).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setNewRank(key)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: newRank === key ? "#E8A0BF" : colors.surface,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: newRank === key ? "#FFF" : colors.foreground }}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
