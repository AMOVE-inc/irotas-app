import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  COUPONS,
  CURRENT_USER,
  RANK_COLORS,
  RANK_LABELS,
  type Coupon,
  type MemberRank,
} from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

const RANK_ORDER: MemberRank[] = ["silver", "gold", "platinum"];

function CouponCard({ coupon }: { coupon: Coupon }) {
  const colors = useColors();
  const userRankIndex = RANK_ORDER.indexOf(CURRENT_USER.rank);
  const requiredRankIndex = RANK_ORDER.indexOf(coupon.requiredRank);
  const isAvailable = userRankIndex >= requiredRankIndex;

  const handleUse = () => {
    if (!isAvailable) {
      const msg = `このクーポンは${RANK_LABELS[coupon.requiredRank]}会員以上限定です`;
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("ランク不足", msg);
      }
      return;
    }
    if (Platform.OS === "web") {
      window.alert(`クーポンコード: ${coupon.code}`);
    } else {
      Alert.alert("クーポンコード", coupon.code, [{ text: "コピー" }, { text: "閉じる" }]);
    }
  };

  return (
    <Pressable
      onPress={handleUse}
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 16,
        overflow: "hidden",
        opacity: isAvailable ? 1 : 0.5,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.surface,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* Left accent */}
        <View
          style={{
            width: 6,
            backgroundColor: RANK_COLORS[coupon.requiredRank],
          }}
        />
        <View style={{ flex: 1, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, flex: 1, marginRight: 8 }}>
              {coupon.title}
            </Text>
            <View
              style={{
                backgroundColor: RANK_COLORS[coupon.requiredRank] + "20",
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: RANK_COLORS[coupon.requiredRank],
                }}
              >
                {RANK_LABELS[coupon.requiredRank]}以上
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 8 }}>
            {coupon.description}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View
              style={{
                backgroundColor: "#E8A0BF15",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "800", color: "#E8A0BF" }}>
                {coupon.discount}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              有効期限: {coupon.expiresAt}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function CouponsScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: Platform.OS === "web" ? 16 : 56,
          paddingBottom: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>
          会員限定クーポン
        </Text>
      </View>

      {/* Current rank info */}
      <View
        style={{
          marginHorizontal: 16,
          marginVertical: 12,
          backgroundColor: RANK_COLORS[CURRENT_USER.rank] + "15",
          borderRadius: 12,
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <IconSymbol name="crown.fill" size={20} color={RANK_COLORS[CURRENT_USER.rank]} />
        <Text style={{ fontSize: 14, color: colors.foreground, marginLeft: 8 }}>
          あなたは
          <Text style={{ fontWeight: "700", color: RANK_COLORS[CURRENT_USER.rank] }}>
            {RANK_LABELS[CURRENT_USER.rank]}会員
          </Text>
          です
        </Text>
      </View>

      <FlatList
        data={COUPONS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CouponCard coupon={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}
