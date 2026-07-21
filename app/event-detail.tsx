import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { EVENTS, CURRENT_USER, DEFAULT_AVATAR, getMemberById, type Event } from "@/constants/mock-data";
import { joinEventChat } from "@/lib/chat-store";
import { getAllEvents } from "@/lib/event-store";
import { getIrotasPoints, adjustIrotasPoints, isFeeExempt } from "@/lib/irotas-points-store";
import { createPaymentRecord } from "@/lib/payment-store";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";

export default function EventDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // モックデータ + 動的追加分から検索
  const allEvents = getAllEvents(EVENTS);
  const event = allEvents.find((e) => e.id === id);

  const [isJoined, setIsJoined] = useState(() => {
    // 既に参加済かチェック
    return event?.participants.includes(CURRENT_USER.id) ?? false;
  });
  const [chatRoomId, setChatRoomId] = useState<string | null>(() => {
    return event?.chatId ?? null;
  });
  // イロタスポイント
  const [irotasPoints, setIrotasPoints] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  const [feeExempt, setFeeExempt] = useState(false);
  // ボタン連打防止フラグ
  const joiningRef = useRef(false);

  useEffect(() => {
    getIrotasPoints(CURRENT_USER.id).then(setIrotasPoints);
    isFeeExempt(CURRENT_USER.id).then(setFeeExempt);
  }, []);

  if (!event) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-6">
        <Text style={{ fontSize: 16, color: colors.muted, textAlign: "center", marginTop: 40 }}>
          イベントが見つかりませんでした
        </Text>
      </ScreenContainer>
    );
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "日時未設定";
    // YYYY-MM-DD形式を直接パース（タイムゾーン問題を回避）
    const match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]);
      const day = parseInt(match[3]);
      const d = new Date(year, month - 1, day);
      const days = ["日", "月", "火", "水", "木", "金", "土"];
      return `${year}年${month}月${day}日(${days[d.getDay()]})`;
    }
    // その他の形式はそのまま表示
    return dateStr;
  };

  // ユーザーのランクに応じた料金を取得
  const getRankPrice = (evt: Event): string => {
    if (!evt.rankPrices) return evt.price;
    const rank = CURRENT_USER.rank as "regular" | "silver" | "gold" | "platinum";
    return evt.rankPrices[rank] ?? evt.price;
  };
  const effectivePrice = getRankPrice(event);
  const hasRankPrices = !!event.rankPrices;

  // 参加費の数値を取得（「3,000円」→ 3000）
  const parsePriceNumber = (priceStr: string): number => {
    const num = parseInt(priceStr.replace(/[^0-9]/g, ""), 10);
    return isNaN(num) ? 0 : num;
  };
  const priceNum = parsePriceNumber(effectivePrice);
  const pointsToUse = usePoints ? Math.min(irotasPoints, priceNum) : 0;
  const finalPrice = Math.max(0, priceNum - pointsToUse);

  const handleJoin = useCallback(() => {
    if (event.status === "full") {
      Alert.alert("満席", "このイベントは満席です");
      return;
    }
    // 連打防止: 既に処理中の場合はスキップ
    if (joiningRef.current) return;

    const priceLabel = priceNum === 0
      ? "無料"
      : usePoints && pointsToUse > 0
        ? `${finalPrice.toLocaleString()}円（${pointsToUse}pt割引適用）`
        : effectivePrice;
    Alert.alert(
      "参加確認",
      `「${event.title}」に参加しますか？\n参加費: ${priceLabel}`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "参加する",
          onPress: async () => {
            // 連打防止ロック
            if (joiningRef.current) return;
            joiningRef.current = true;
            try {
              // イロタスポイントを使用する場合は消費
              if (usePoints && pointsToUse > 0) {
                const newBalance = await adjustIrotasPoints(
                  CURRENT_USER.id,
                  CURRENT_USER.name,
                  -pointsToUse,
                  `イベント「${event.title}」参加費割引`
                );
                setIrotasPoints(newBalance);
              }
              // 参加者リストに追加（nullチェック付き）
              const participants = event.participants ?? [];
              if (!participants.includes(CURRENT_USER.id)) {
                participants.push(CURRENT_USER.id);
                event.participants = participants;
                event.attendees = participants.length;
              }
              setIsJoined(true);

              // 支払いレコードを作成
              await createPaymentRecord({
                eventId: event.id,
                userId: CURRENT_USER.id,
                userName: CURRENT_USER.name,
                userRank: CURRENT_USER.rank,
                amount: finalPrice,
              });

              // チャットルームに参加（なければ作成）
              const room = joinEventChat(
                event.id,
                event.title,
                event.chatId,
                CURRENT_USER.id,
              );
              setChatRoomId(room.id);

              // チャットへ誘導
              Alert.alert(
                "参加完了！",
                `「${event.title}」への参加が完了しました。\n参加者専用チャットに参加しますか？`,
                [
                  { text: "後で", style: "cancel" },
                  {
                    text: "チャットを開く",
                    onPress: () => {
                      router.push({ pathname: "/chat", params: { id: room.id } });
                    },
                  },
                ],
              );
            } catch (err) {
              console.error("[EventDetail] handleJoin error:", err);
              Alert.alert("エラー", "参加処理中にエラーが発生しました。もう一度お試しください。");
            } finally {
              joiningRef.current = false;
            }
          },
        },
      ],
    );
  }, [event, priceNum, usePoints, pointsToUse, finalPrice, effectivePrice, router]);

  const handleOpenChat = () => {
    if (chatRoomId) {
      router.push({ pathname: "/chat", params: { id: chatRoomId } });
    }
  };

  const handleOpenMap = () => {
    const query = encodeURIComponent(event.location);
    const url = Platform.OS === "ios"
      ? `maps:?q=${query}`
      : `https://maps.google.com/?q=${query}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Linking.openURL(`https://maps.google.com/?q=${query}`);
      }
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header Image */}
      <View>
        <Image
          source={event.image}
          style={{ width: "100%", height: 250 }}
          contentFit="cover"
          transition={300}
        />
        <Pressable
          onPress={() => router.back()}
          style={{
            position: "absolute",
            top: 50,
            left: 16,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconSymbol name="arrow.left" size={18} color="#FFF" />
        </Pressable>

        {/* Status badge */}
        <View style={{ position: "absolute", top: 50, right: 16 }}>
          <View
            style={{
              backgroundColor:
                event.status === "open"
                  ? "#34C759"
                  : event.status === "full"
                  ? "#FF9500"
                  : "#8E8E93",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFF" }}>
              {event.status === "open" ? "受付中" : event.status === "full" ? "満席" : "終了"}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {/* Title */}
        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground, marginBottom: 12 }}>
          {event.title}
        </Text>

        {/* 参加済みチャットバナー */}
        {isJoined && chatRoomId && (
          <Pressable
            onPress={handleOpenChat}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#34C75915",
              borderRadius: 14,
              padding: 14,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: "#34C75930",
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "#34C75920",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <IconSymbol name="message.fill" size={18} color="#34C759" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#34C759" }}>
                参加者専用チャット
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                タップしてチャットを開く →
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color="#34C759" />
          </Pressable>
        )}

        {/* Info cards */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#E8A0BF15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconSymbol name="clock.fill" size={20} color="#E8A0BF" />
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                {formatDate(event.date)}
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>{event.time}〜</Text>
            </View>
          </View>

          <Pressable
            onPress={handleOpenMap}
            style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#A7C7E715",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconSymbol name="mappin.and.ellipse" size={20} color="#A7C7E7" />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                {event.location}
              </Text>
              <Text style={{ fontSize: 13, color: "#A7C7E7" }}>タップして地図を開く ↗</Text>
            </View>
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#34C75915",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconSymbol name="person.2.fill" size={20} color="#34C759" />
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                {event.attendees}/{event.capacity}人参加
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>
                残り{Math.max(0, event.capacity - event.attendees)}席
              </Text>
            </View>
          </View>
        </View>

        {/* Price + イロタスポイント割引 */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>参加費</Text>
              {hasRankPrices && (
                <Text style={{ fontSize: 11, color: "#E8A0BF", marginTop: 2 }}>
                  ランク別料金適用中（{CURRENT_USER.rank.toUpperCase()}）
                </Text>
              )}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              {usePoints && pointsToUse > 0 ? (
                <>
                  <Text style={{ fontSize: 13, color: colors.muted, textDecorationLine: "line-through" }}>
                    {effectivePrice}
                  </Text>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: "#34C759" }}>
                    {finalPrice === 0 ? "無料" : `${finalPrice.toLocaleString()}円`}
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 22, fontWeight: "800", color: "#E8A0BF" }}>{effectivePrice}</Text>
              )}
            </View>
          </View>

          {/* ランク別料金一覧 */}
          {hasRankPrices && event.rankPrices && (
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 0.5,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
                ランク別料金
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {([
                  { key: "regular", label: "レギュラー", color: "#8E8E93" },
                  { key: "silver", label: "シルバー", color: "#8E8E93" },
                  { key: "gold", label: "ゴールド", color: "#FF9500" },
                  { key: "platinum", label: "プラチナ", color: "#A7C7E7" },
                ] as const).map(({ key, label, color }) => {
                  const rankPrice = event.rankPrices![key];
                  if (!rankPrice) return null;
                  const isCurrent = CURRENT_USER.rank === key;
                  return (
                    <View
                      key={key}
                      style={{
                        flex: 1,
                        minWidth: 70,
                        backgroundColor: isCurrent ? `${color}20` : colors.background,
                        borderRadius: 8,
                        padding: 8,
                        alignItems: "center",
                        borderWidth: isCurrent ? 1.5 : 0.5,
                        borderColor: isCurrent ? color : colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 10, color: isCurrent ? color : colors.muted, fontWeight: isCurrent ? "700" : "400" }}>
                        {label}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: isCurrent ? color : colors.foreground, marginTop: 2 }}>
                        {rankPrice}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* イロタスポイント割引トグル */}
          {priceNum > 0 && irotasPoints > 0 && !isJoined && (
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 0.5,
                borderTopColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#FF9500" }}>
                  ★ イロタスポイントを使用する
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  保有: {irotasPoints.toLocaleString()}pt
                  {usePoints && pointsToUse > 0 ? ` → ${pointsToUse.toLocaleString()}pt使用` : ""}
                </Text>
              </View>
              <Switch
                value={usePoints}
                onValueChange={setUsePoints}
                trackColor={{ false: colors.border, true: "#FF9500" }}
                thumbColor="#FFF"
              />
            </View>
          )}
        </View>

        {/* Description */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
            イベント詳細
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 24, color: colors.foreground }}>
            {event.description}
          </Text>
        </View>

        {/* 参加者一覧（参加済みの場合） */}
        {isJoined && event.participants.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>
              参加者 ({event.participants.length}人)
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {event.participants.slice(0, 8).map((uid) => (
                <View
                  key={uid}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: uid === CURRENT_USER.id ? 2 : 0,
                    borderColor: "#E8A0BF",
                    overflow: "hidden",
                  }}
                >
                  <Image
                    source={getMemberById(uid)?.avatar ?? DEFAULT_AVATAR}
                    style={{ width: 40, height: 40 }}
                    contentFit="cover"
                  />
                </View>
              ))}
              {event.participants.length > 8 && (
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted }}>
                    +{event.participants.length - 8}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.background,
          borderTopWidth: 0.5,
          borderTopColor: colors.border,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Platform.OS === "web" ? 16 : 34,
          gap: 10,
        }}
      >
        {/* チャットボタン（参加済みの場合） */}
        {isJoined && chatRoomId && (
          <Pressable
            onPress={handleOpenChat}
            style={({ pressed }) => ({
              backgroundColor: "#34C75915",
              borderRadius: 14,
              paddingVertical: 13,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "#34C75930",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <IconSymbol name="message.fill" size={18} color="#34C759" />
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#34C759", marginLeft: 8 }}>
              参加者チャットを開く
            </Text>
          </Pressable>
        )}

        {/* 参加ボタン */}
        <Pressable
          onPress={isJoined ? undefined : handleJoin}
          style={({ pressed }) => ({
            backgroundColor: isJoined
              ? "#34C759"
              : event.status === "full"
              ? colors.muted
              : "#E8A0BF",
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            opacity: pressed && !isJoined ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#FFF" }}>
            {isJoined ? "✓ 参加済み" : event.status === "full" ? "満席" : "参加する"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
