import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, RANK_COLORS, RANK_LABELS, type Coupon } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { formatCouponTimestamp, getCouponAvailability, type CouponUsage } from "@/lib/coupon-rules";
import { recordCouponPresentation, redeemCoupon, useCoupons, useCouponUsages } from "@/lib/coupon-store";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";

const STATUS_COPY = {
  rank_locked: "対象ランク外",
  expired: "有効期限切れ",
  used: "使用済み",
  available: "利用可能",
} as const;

function CouponCard({ coupon, usage, onPresent }: { coupon: Coupon; usage?: CouponUsage; onPresent: () => void }) {
  const colors = useColors();
  const availability = getCouponAvailability(coupon, CURRENT_USER.rank, usage, new Date(), CURRENT_USER.id);
  const canPresent = availability === "available";

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12, borderRadius: 16, overflow: "hidden", opacity: canPresent ? 1 : 0.62 }}>
      <View style={{ flexDirection: "row", backgroundColor: colors.surface }}>
        <View style={{ width: 6, backgroundColor: canPresent ? RANK_COLORS[coupon.requiredRank] : colors.border }} />
        <View style={{ flex: 1, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground, flex: 1 }}>{coupon.title}</Text>
            <View style={{ backgroundColor: canPresent ? "#34C75918" : colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: canPresent ? "#248A3D" : colors.muted }}>{STATUS_COPY[availability]}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 7 }}>{coupon.description}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
            <View style={{ backgroundColor: "#E8A0BF15", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontSize: 15, fontWeight: "900", color: "#E8A0BF" }}>{coupon.discount}</Text>
            </View>
            <View style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>
                {coupon.usageType === "single" ? "1回限定" : "期間中何度でも"}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: 12, gap: 3 }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>有効期限：{coupon.expiresAt}</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>最終提示：{formatCouponTimestamp(usage?.lastPresentedAt)}</Text>
            {usage?.useCount ? <Text style={{ fontSize: 12, color: colors.muted }}>利用回数：{usage.useCount}回</Text> : null}
          </View>
          <Pressable
            onPress={onPresent}
            disabled={!canPresent}
            style={{ marginTop: 14, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: canPresent ? "#E8A0BF" : colors.border }}
          >
            <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "800" }}>
              {canPresent ? "クーポンを提示する" : STATUS_COPY[availability]}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function PresentCouponModal({ coupon, onClose, onRedeem }: { coupon: Coupon | null; onClose: () => void; onRedeem: () => void }) {
  const colors = useColors();
  if (!coupon) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000A", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <View style={{ width: "100%", maxWidth: 440, backgroundColor: colors.surface, borderRadius: 24, padding: 22 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: "#E8A0BF" }}>IRO＋ 会員限定クーポン</Text>
            <Pressable onPress={onClose}><IconSymbol name="xmark" size={22} color={colors.foreground} /></Pressable>
          </View>
          <Text style={{ fontSize: 24, lineHeight: 32, fontWeight: "900", color: colors.foreground, marginTop: 22, textAlign: "center" }}>{coupon.title}</Text>
          <Text style={{ fontSize: 34, fontWeight: "900", color: "#E8A0BF", textAlign: "center", marginTop: 12 }}>{coupon.discount}</Text>
          <View style={{ marginTop: 22, padding: 18, borderRadius: 16, backgroundColor: colors.background, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>店舗確認コード</Text>
            <Text selectable style={{ fontSize: 25, letterSpacing: 2, fontWeight: "900", color: colors.foreground, marginTop: 5 }}>{coupon.code}</Text>
          </View>
          <Text style={{ fontSize: 14, lineHeight: 21, color: colors.foreground, textAlign: "center", marginTop: 18 }}>この画面を店舗スタッフに提示してください。</Text>
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 6 }}>有効期限 {coupon.expiresAt} ／ {coupon.usageType === "single" ? "1回限定" : "期間中何度でも"}</Text>
          <Pressable onPress={onRedeem} style={{ marginTop: 22, backgroundColor: "#34C759", borderRadius: 14, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "900" }}>{coupon.usageType === "single" ? "店舗確認後、使用済みにする" : "今回の利用を記録する"}</Text>
          </Pressable>
          <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", lineHeight: 16, marginTop: 8 }}>店舗スタッフの確認前に押さないでください。</Text>
        </View>
      </View>
    </Modal>
  );
}

export default function CouponsScreen() {
  const colors = useColors();
  const router = useRouter();
  const coupons = useCoupons();
  const usages = useCouponUsages(CURRENT_USER.id);
  const [presentingCoupon, setPresentingCoupon] = useState<Coupon | null>(null);

  const handlePresent = async (coupon: Coupon) => {
    if (getCouponAvailability(coupon, CURRENT_USER.rank, usages[coupon.id], new Date(), CURRENT_USER.id) !== "available") return;
    await recordCouponPresentation(CURRENT_USER.id, coupon.id);
    setPresentingCoupon(coupon);
  };

  const handleRedeem = () => {
    if (!presentingCoupon) return;
    const coupon = presentingCoupon;
    const complete = async () => {
      await redeemCoupon(CURRENT_USER.id, coupon);
      setPresentingCoupon(null);
      Alert.alert("利用を記録しました", coupon.usageType === "single" ? "このクーポンは使用済みになりました。" : "最新の利用日時を更新しました。");
    };
    if (Platform.OS === "web") {
      if (window.confirm(coupon.usageType === "single" ? "使用済みにすると再提示できません。よろしいですか？" : "今回の利用を記録しますか？")) void complete();
      return;
    }
    Alert.alert("利用確認", coupon.usageType === "single" ? "使用済みにすると再提示できません。" : "今回の利用を記録します。", [
      { text: "キャンセル", style: "cancel" },
      { text: "記録する", onPress: () => { void complete(); } },
    ]);
  };

  const sortedCoupons = coupons.filter((coupon) => !coupon.recipientIds || coupon.recipientIds.includes(CURRENT_USER.id)).sort((a, b) => {
    const aAvailable = getCouponAvailability(a, CURRENT_USER.rank, usages[a.id], new Date(), CURRENT_USER.id) === "available";
    const bAvailable = getCouponAvailability(b, CURRENT_USER.rank, usages[b.id], new Date(), CURRENT_USER.id) === "available";
    if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
    return b.expiresAt.localeCompare(a.expiresAt);
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: Platform.OS === "web" ? 16 : 56, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}><IconSymbol name="arrow.left" size={24} color={colors.foreground} /></Pressable>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: colors.foreground }}>会員限定クーポン</Text>
        {CURRENT_USER.role === "admin" ? (
          <Pressable onPress={() => router.push({ pathname: "/admin-dashboard", params: { tab: "coupons" } })}>
            <Text style={{ color: "#E8A0BF", fontSize: 13, fontWeight: "800" }}>管理設定</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 30 }}>
        <View style={{ marginHorizontal: 16, marginBottom: 14, backgroundColor: RANK_COLORS[CURRENT_USER.rank] + "15", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center" }}>
          <IconSymbol name="crown.fill" size={20} color={RANK_COLORS[CURRENT_USER.rank]} />
          <Text style={{ fontSize: 14, color: colors.foreground, marginLeft: 8 }}>あなたは <Text style={{ fontWeight: "800", color: RANK_COLORS[CURRENT_USER.rank] }}>{RANK_LABELS[CURRENT_USER.rank]}会員</Text> です</Text>
        </View>
        {sortedCoupons.map((coupon) => <CouponCard key={coupon.id} coupon={coupon} usage={usages[coupon.id]} onPresent={() => { void handlePresent(coupon); }} />)}
      </ScrollView>
      <PresentCouponModal coupon={presentingCoupon} onClose={() => setPresentingCoupon(null)} onRedeem={handleRedeem} />
    </View>
  );
}
