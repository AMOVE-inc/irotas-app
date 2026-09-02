import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { Coupon, MemberRank } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import { isOperatorRole } from "@/lib/access-control";
import { createCoupon, deleteCoupon, setCouponStatus, updateCoupon, useCoupons } from "@/lib/coupon-store";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

type CouponDraft = Omit<Coupon, "id">;

const RANKS: { value: MemberRank; label: string }[] = [
  { value: "regular", label: "レギュラー" },
  { value: "silver", label: "シルバー" },
  { value: "gold", label: "ゴールド" },
  { value: "platinum", label: "プラチナ" },
];

const EMPTY_DRAFT: CouponDraft = {
  title: "",
  description: "",
  discount: "",
  expiresAt: "",
  code: "",
  requiredRank: "regular",
  usageType: "single",
  status: "active",
  imageUrl: "",
};

function confirm(message: string, onAccept: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(message)) onAccept();
    return;
  }
  Alert.alert("確認", message, [{ text: "キャンセル", style: "cancel" }, { text: "実行する", style: "destructive", onPress: onAccept }]);
}

function Field({ label, value, onChange, multiline = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; placeholder?: string }) {
  const colors = useColors();
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={{ minHeight: multiline ? 96 : 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, color: colors.foreground, fontSize: 15, textAlignVertical: multiline ? "top" : "center" }}
      />
    </View>
  );
}

export default function CouponManagerScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuthContext();
  const coupons = useCoupons();
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [draft, setDraft] = useState<CouponDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const userCanManage = isOperatorRole(user?.role, user?.accessRole);
  const sorted = useMemo(() => [...coupons].sort((a, b) => (a.status === "ended" ? 1 : 0) - (b.status === "ended" ? 1 : 0) || a.expiresAt.localeCompare(b.expiresAt)), [coupons]);

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setEditorVisible(true);
  };
  const openEdit = (coupon: Coupon) => {
    setEditing(coupon);
    const { id: _id, ...next } = coupon;
    setDraft({ ...EMPTY_DRAFT, ...next });
    setEditorVisible(true);
  };
  const closeEditor = () => {
    setEditorVisible(false);
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  };
  const save = async () => {
    if (!draft.title.trim() || !draft.description.trim() || !draft.discount.trim() || !draft.expiresAt.trim() || !draft.code.trim()) {
      Alert.alert("入力を確認してください", "タイトル、説明、特典内容、有効期限、確認コードは必須です。");
      return;
    }
    setSaving(true);
    try {
      const coupon: Coupon = {
        id: editing?.id ?? `coupon-${Date.now()}`,
        ...draft,
        imageUrl: draft.imageUrl?.trim() || undefined,
      };
      if (editing) await updateCoupon(coupon);
      else await createCoupon(coupon);
      closeEditor();
    } catch (error) {
      Alert.alert("保存できませんでした", error instanceof Error ? error.message : "しばらくしてから再度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  if (!userCanManage) {
    return <ScreenContainer className="p-6"><Text style={{ color: colors.muted, textAlign: "center", marginTop: 40 }}>管理者または運営メンバーのみアクセスできます</Text></ScreenContainer>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: Platform.OS === "web" ? 16 : 56, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="戻る"><IconSymbol name="arrow.left" size={23} color={colors.foreground} /></Pressable>
        <Text style={{ flex: 1, marginLeft: 12, color: colors.foreground, fontSize: 20, fontWeight: "900" }}>クーポン管理</Text>
        <Pressable onPress={openCreate} style={{ backgroundColor: "#FF9500", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}><Text style={{ color: "#FFF", fontWeight: "900" }}>新規作成</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>運営メンバーと管理者が共通で管理できます。変更は全端末の会員画面に反映されます。</Text>
        {sorted.map((coupon) => {
          const ended = coupon.status === "ended";
          return <View key={coupon.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 15, padding: 14, backgroundColor: colors.surface, opacity: ended ? 0.6 : 1 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900" }}>{coupon.title}</Text>
                <Text style={{ color: "#E8A0BF", fontSize: 17, fontWeight: "900", marginTop: 4 }}>{coupon.discount}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>期限：{coupon.expiresAt} ／ {coupon.usageType === "single" ? "1回限定" : "複数回利用可"}</Text>
              </View>
              <Text style={{ color: ended ? colors.muted : "#247A42", fontSize: 12, fontWeight: "900" }}>{ended ? "終了" : "公開中"}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable onPress={() => openEdit(coupon)} style={{ flex: 1, borderRadius: 10, padding: 10, alignItems: "center", backgroundColor: colors.background }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>編集</Text></Pressable>
              <Pressable onPress={() => void setCouponStatus(coupon.id, ended ? "active" : "ended")} style={{ flex: 1, borderRadius: 10, padding: 10, alignItems: "center", backgroundColor: ended ? "#DFF4E6" : "#FFF0DD" }}><Text style={{ color: ended ? "#247A42" : "#C26D00", fontWeight: "800" }}>{ended ? "再開" : "終了"}</Text></Pressable>
              <Pressable onPress={() => confirm("このクーポンを削除します。会員画面からも直ちに消えます。", () => { void deleteCoupon(coupon.id).catch(() => Alert.alert("削除できませんでした")); })} style={{ borderRadius: 10, paddingHorizontal: 13, justifyContent: "center", backgroundColor: "#FFF0F0" }}><IconSymbol name="trash" size={18} color="#E23B3B" /></Pressable>
            </View>
          </View>;
        })}
      </ScrollView>
      <Modal visible={editorVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeEditor}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable onPress={closeEditor}><Text style={{ color: colors.muted, fontSize: 15, fontWeight: "700" }}>キャンセル</Text></Pressable>
            <Text style={{ flex: 1, textAlign: "center", color: colors.foreground, fontSize: 18, fontWeight: "900" }}>{editing ? "クーポンを編集" : "クーポンを作成"}</Text>
            <Pressable disabled={saving} onPress={() => void save()}><Text style={{ color: saving ? colors.muted : "#E8A0BF", fontSize: 15, fontWeight: "900" }}>{saving ? "保存中…" : "保存"}</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 44 }}>
            <Field label="タイトル" value={draft.title} onChange={(title) => setDraft((current) => ({ ...current, title }))} />
            <Field label="説明" multiline value={draft.description} onChange={(description) => setDraft((current) => ({ ...current, description }))} />
            <Field label="特典内容" value={draft.discount} onChange={(discount) => setDraft((current) => ({ ...current, discount }))} placeholder="例：会計から1,000円OFF" />
            <Field label="有効期限" value={draft.expiresAt} onChange={(expiresAt) => setDraft((current) => ({ ...current, expiresAt }))} placeholder="例：2026-09-30" />
            <Field label="店舗確認コード" value={draft.code} onChange={(code) => setDraft((current) => ({ ...current, code }))} />
            <Field label="画像URL（任意）" value={draft.imageUrl ?? ""} onChange={(imageUrl) => setDraft((current) => ({ ...current, imageUrl }))} placeholder="https://..." />
            <View style={{ gap: 8 }}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800" }}>対象ランク</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{RANKS.map((rank) => <Pressable key={rank.value} onPress={() => setDraft((current) => ({ ...current, requiredRank: rank.value }))} style={{ borderWidth: 1, borderColor: draft.requiredRank === rank.value ? "#E8A0BF" : colors.border, backgroundColor: draft.requiredRank === rank.value ? "#FFF0F6" : colors.surface, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: draft.requiredRank === rank.value ? "#C44A82" : colors.foreground, fontWeight: "800" }}>{rank.label}</Text></Pressable>)}</View></View>
            <View style={{ gap: 8 }}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800" }}>利用回数</Text><View style={{ flexDirection: "row", gap: 8 }}>{(["single", "multiple"] as const).map((usageType) => <Pressable key={usageType} onPress={() => setDraft((current) => ({ ...current, usageType }))} style={{ flex: 1, borderWidth: 1, borderColor: draft.usageType === usageType ? "#E8A0BF" : colors.border, borderRadius: 10, padding: 11, alignItems: "center" }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{usageType === "single" ? "1回限定" : "複数回利用可"}</Text></Pressable>)}</View></View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
