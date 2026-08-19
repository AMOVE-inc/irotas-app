import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import { isOperatorRole } from "@/lib/access-control";
import { createCampaign, deleteCampaign, setCampaignStatus, updateCampaign, useCampaigns, type Campaign } from "@/lib/campaign-store";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

const STATUS_LABELS = { active: "実施中", scheduled: "予定", ended: "終了" };
const STATUS_COLORS = { active: "#34C759", scheduled: "#A7C7E7", ended: "#8E8E93" };
const TYPE_LABELS = { points: "ポイント", event: "イベント", gift: "プレゼント", notification: "通知" };
const TYPE_COLORS = { points: "#E8A0BF", event: "#A7C7E7", gift: "#FF9500", notification: "#AF52DE" };
const RANK_LABELS_MAP = { all: "全会員", silver: "シルバー以上", gold: "ゴールド以上", platinum: "プラチナ" };

export default function CampaignManagerScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const campaigns = useCampaigns();
  const [showCreate, setShowCreate] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<Campaign["type"]>("points");
  const [newRank, setNewRank] = useState<Campaign["targetRank"]>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  if (!isOperatorRole(authUser?.role, authUser?.accessRole)) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ fontSize: 16, color: colors.muted, textAlign: "center", marginTop: 40 }}>
          運営メンバーのみアクセスできます
        </Text>
      </ScreenContainer>
    );
  }

  const openCreate = () => {
    const today = new Date().toISOString().split("T")[0];
    setEditingCampaign(null); setNewTitle(""); setNewDesc(""); setNewType("points"); setNewRank("all"); setStartDate(today); setEndDate(today); setShowCreate(true);
  };

  const openEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign); setNewTitle(campaign.title); setNewDesc(campaign.description); setNewType(campaign.type); setNewRank(campaign.targetRank); setStartDate(campaign.startDate); setEndDate(campaign.endDate); setShowCreate(true);
  };

  const handleSave = async () => {
    if (!newTitle.trim()) return;
    const today = new Date().toISOString().split("T")[0];
    const savedCampaign: Campaign = {
      id: editingCampaign?.id ?? `c_${Date.now()}`,
      title: newTitle.trim(),
      description: newDesc.trim(),
      targetRank: newRank,
      startDate: startDate || today,
      endDate: endDate || today,
      status: editingCampaign?.status ?? "active",
      type: newType,
      reachCount: editingCampaign?.reachCount ?? 0,
    };
    editingCampaign ? await updateCampaign(savedCampaign) : await createCampaign(savedCampaign);
    setShowCreate(false);
    Alert.alert(editingCampaign ? "更新完了" : "作成完了", editingCampaign ? "キャンペーンを更新しました。" : "キャンペーンを作成しました。");
  };

  const handleToggleStatus = async (campaign: Campaign) => {
    const next = campaign.status === "active" ? "ended" : "active";
    await setCampaignStatus(campaign.id, next);
  };

  const handleDelete = (campaign: Campaign) => Alert.alert("キャンペーンを削除", `${campaign.title}を削除しますか？`, [{ text: "キャンセル", style: "cancel" }, { text: "削除", style: "destructive", onPress: () => { void deleteCampaign(campaign.id); } }]);

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
          onPress={openCreate}
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
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginBottom: 10 }}>キャンペーン一覧</Text>
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

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <Pressable onPress={() => openEdit(campaign)} style={{ flex: 1, backgroundColor: "#5D5C7418", borderRadius: 10, paddingVertical: 8, alignItems: "center" }}><Text style={{ color: "#5D5C74", fontWeight: "800" }}>編集</Text></Pressable>
              <Pressable onPress={() => handleDelete(campaign)} style={{ flex: 1, backgroundColor: "#FF3B3018", borderRadius: 10, paddingVertical: 8, alignItems: "center" }}><Text style={{ color: "#FF3B30", fontWeight: "800" }}>削除</Text></Pressable>
            </View>
            {/* 終了・再開 */}
              <Pressable
                onPress={() => { void handleToggleStatus(campaign); }}
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
                  {campaign.status === "active" ? "キャンペーンを終了する" : "キャンペーンを再開する"}
                </Text>
              </Pressable>
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
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>{editingCampaign ? "キャンペーン編集" : "キャンペーン作成"}</Text>
            <Pressable onPress={() => { void handleSave(); }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: newTitle.trim() ? "#E8A0BF" : colors.muted }}>
                {editingCampaign ? "保存" : "作成"}
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

            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>開始日（YYYY-MM-DD）</Text>
            <TextInput value={startDate} onChangeText={setStartDate} placeholder="2026-08-01" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, marginBottom: 16 }} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>終了日（YYYY-MM-DD）</Text>
            <TextInput value={endDate} onChangeText={setEndDate} placeholder="2026-12-31" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, marginBottom: 16 }} />

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
