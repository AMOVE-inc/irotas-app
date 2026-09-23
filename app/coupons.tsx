import { openExternalUrl } from "@/lib/open-external-url";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, RANK_COLORS, RANK_LABELS, type Coupon } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { formatCouponTimestamp, getCouponAvailability, type CouponUsage } from "@/lib/coupon-rules";
import { parseCouponDescription } from "@/lib/coupon-description";
import { recordCouponPresentation, redeemCoupon, useCoupons, useCouponUsages } from "@/lib/coupon-store";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { AuthenticatedImage as Image } from "@/components/authenticated-image";
import { useAuthContext } from "@/lib/auth-context";
import { isOperatorRole } from "@/lib/access-control";

const STATUS_COPY = {
  rank_locked: "対象ランク外",
  expired: "有効期限切れ",
  used: "使用済み",
  available: "利用可能",
} as const;

function CouponCard({ coupon, usage, onOpen, memberRank, memberId }: { coupon: Coupon; usage?: CouponUsage; onOpen: () => void; memberRank: typeof CURRENT_USER.rank; memberId: string }) {
  const colors = useColors();
  const availability = getCouponAvailability(coupon, memberRank, usage, new Date(), memberId);
  const canPresent = availability === "available";

  return (
    <Pressable onPress={onOpen} style={{ marginHorizontal: 16, marginBottom: 10, borderRadius: 16, overflow: "hidden", opacity: canPresent ? 1 : 0.62, borderWidth: 1, borderColor: canPresent ? "transparent" : colors.border }}>
      <View style={{ flexDirection: "row", backgroundColor: colors.surface }}>
        <View style={{ width: 6, backgroundColor: canPresent ? RANK_COLORS[coupon.requiredRank] : colors.border }} />
        <View style={{ flex: 1, padding: 13 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {coupon.imageUrl ? <Image source={{ uri: coupon.imageUrl }} style={{ width: 88, height: 88, borderRadius: 12, marginRight: 12 }} contentFit="cover" /> : <View style={{ width: 88, height: 88, borderRadius: 12, marginRight: 12, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><IconSymbol name="ticket.fill" size={30} color={colors.muted} /></View>}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 21, fontWeight: "800", color: colors.foreground }}>{coupon.title}</Text>
              <Text style={{ fontSize: 18, fontWeight: "900", color: canPresent ? "#E8A0BF" : colors.muted, marginTop: 5 }}>{coupon.discount}</Text>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, marginTop: 5 }}>{coupon.usageType === "single" ? "1回限定" : "期間中何度でも"}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>期限：{coupon.expiresAt}</Text>
            </View>
          </View>
          <Pressable
            onPress={(event) => { event.stopPropagation?.(); onOpen(); }}
            style={{ marginTop: 11, borderRadius: 11, paddingVertical: 10, alignItems: "center", backgroundColor: canPresent ? "#E8A0BF" : colors.border }}
          >
            <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "800" }}>{canPresent ? "クーポンを使う" : STATUS_COPY[availability]}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function CouponDescriptionText({ description, color }: { description: string; color: string }) {
  return (
    <Text style={{ fontSize: 14, lineHeight: 22, color, marginTop: 14 }}>
      {parseCouponDescription(description).map((part, index) => (
        <Text
          key={`${index}-${part.text}`}
          accessibilityRole={part.url ? "link" : undefined}
          onPress={part.url ? () => { void openExternalUrl(part.url!).catch(() => Alert.alert("リンクを開けませんでした")); } : undefined}
          style={{ fontWeight: part.bold ? "800" : "400", color: part.url ? "#3478C7" : color, textDecorationLine: part.url ? "underline" : "none" }}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

function CouponDetailModal({ coupon, usage, onClose, onPresent, memberRank, memberId }: { coupon: Coupon | null; usage?: CouponUsage; onClose: () => void; onPresent: (coupon: Coupon) => void; memberRank: typeof CURRENT_USER.rank; memberId: string }) {
  const colors = useColors();
  if (!coupon) return null;
  const availability = getCouponAvailability(coupon, memberRank, usage, new Date(), memberId);
  const canPresent = availability === "available";
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><View style={{ flex: 1, backgroundColor: colors.background }}><View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 18, fontWeight: "900", color: colors.foreground }}>クーポン詳細</Text><Pressable onPress={onClose}><IconSymbol name="xmark" size={22} color={colors.foreground} /></Pressable></View><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>{coupon.imageUrl ? <Image source={{ uri: coupon.imageUrl }} style={{ width: "100%", aspectRatio: 1, borderRadius: 18, opacity: canPresent ? 1 : 0.55 }} contentFit="cover" /> : null}<View style={{ alignSelf: "flex-start", marginTop: 16, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: canPresent ? "#DFF4E6" : "#E1E1E4" }}><Text style={{ fontSize: 11, fontWeight: "900", color: canPresent ? "#247A42" : colors.muted }}>{STATUS_COPY[availability]}</Text></View><Text style={{ fontSize: 23, lineHeight: 31, fontWeight: "900", color: colors.foreground, marginTop: 12 }}>{coupon.title}</Text><Text style={{ fontSize: 28, fontWeight: "900", color: canPresent ? "#E8A0BF" : colors.muted, marginTop: 12 }}>{coupon.discount}</Text><CouponDescriptionText description={coupon.description} color={colors.foreground} /><View style={{ marginTop: 18, gap: 5 }}><Text style={{ fontSize: 12, color: colors.muted }}>回数：{coupon.usageType === "single" ? "1回限定" : "期間中何度でも"}</Text><Text style={{ fontSize: 12, color: colors.muted }}>有効期限：{coupon.expiresAt}</Text><Text style={{ fontSize: 12, color: colors.muted }}>最終提示：{formatCouponTimestamp(usage?.lastPresentedAt)}</Text>{usage?.useCount ? <Text style={{ fontSize: 12, color: colors.muted }}>利用回数：{usage.useCount}回</Text> : null}</View>{coupon.sourceContestId === "discord-archive" ? <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>Discordから移行した過去のクーポンです</Text> : null}<Pressable disabled={!canPresent} onPress={() => onPresent(coupon)} style={{ marginTop: 24, minHeight: 52, borderRadius: 14, backgroundColor: canPresent ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: canPresent ? "#FFF" : colors.muted, fontSize: 15, fontWeight: "900" }}>{canPresent ? "クーポンを提示する" : STATUS_COPY[availability]}</Text></Pressable></ScrollView></View></Modal>;
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
          {coupon.imageUrl ? <Image source={{ uri: coupon.imageUrl }} style={{ width: 180, height: 180, borderRadius: 16, alignSelf: "center", marginTop: 16 }} contentFit="cover" /> : null}
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
  const { user: authUser } = useAuthContext();
  const colors = useColors();
  const router = useRouter();
  const coupons = useCoupons();
  const memberId = authUser?.memberId ?? String(authUser?.id ?? CURRENT_USER.id);
  const memberRank = (authUser?.memberRank ?? CURRENT_USER.rank) as typeof CURRENT_USER.rank;
  const usages = useCouponUsages(memberId);
  const [presentingCoupon, setPresentingCoupon] = useState<Coupon | null>(null);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);

  const handlePresent = async (coupon: Coupon) => {
    if (getCouponAvailability(coupon, memberRank, usages[coupon.id], new Date(), memberId) !== "available") return;
    await recordCouponPresentation(memberId, coupon.id);
    setPresentingCoupon(coupon);
  };

  const handleRedeem = () => {
    if (!presentingCoupon) return;
    const coupon = presentingCoupon;
    const complete = async () => {
      await redeemCoupon(memberId, coupon);
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

  const sortedCoupons = coupons.filter((coupon) => !coupon.recipientIds || coupon.recipientIds.includes(memberId)).sort((a, b) => {
    const aAvailable = getCouponAvailability(a, memberRank, usages[a.id], new Date(), memberId) === "available";
    const bAvailable = getCouponAvailability(b, memberRank, usages[b.id], new Date(), memberId) === "available";
    if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
    return b.expiresAt.localeCompare(a.expiresAt);
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: Platform.OS === "web" ? 16 : 56, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}><IconSymbol name="arrow.left" size={24} color={colors.foreground} /></Pressable>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: colors.foreground }}>会員限定クーポン</Text>
        {isOperatorRole(authUser?.role, authUser?.accessRole) ? (
          <Pressable onPress={() => router.push("/coupon-manager" as any)}>
            <Text style={{ color: "#E8A0BF", fontSize: 13, fontWeight: "800" }}>管理設定</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 30 }}>
        <View style={{ marginHorizontal: 16, marginBottom: 14, backgroundColor: RANK_COLORS[memberRank] + "15", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center" }}>
          <IconSymbol name="crown.fill" size={20} color={RANK_COLORS[memberRank]} />
          <Text style={{ fontSize: 14, color: colors.foreground, marginLeft: 8 }}>あなたは <Text style={{ fontWeight: "800", color: RANK_COLORS[memberRank] }}>{RANK_LABELS[memberRank]}会員</Text> です</Text>
        </View>
        {sortedCoupons.map((coupon) => <CouponCard key={coupon.id} coupon={coupon} usage={usages[coupon.id]} memberRank={memberRank} memberId={memberId} onOpen={() => setSelectedCoupon(coupon)} />)}
      </ScrollView>
      <PresentCouponModal coupon={presentingCoupon} onClose={() => setPresentingCoupon(null)} onRedeem={handleRedeem} />
      <CouponDetailModal coupon={selectedCoupon} usage={selectedCoupon ? usages[selectedCoupon.id] : undefined} memberRank={memberRank} memberId={memberId} onClose={() => setSelectedCoupon(null)} onPresent={(coupon) => { setSelectedCoupon(null); void handlePresent(coupon); }} />
    </View>
  );
}
