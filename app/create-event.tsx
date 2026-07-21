import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, type Event } from "@/constants/mock-data";
import { pendingEvents } from "@/lib/event-store";
import { useAuthContext } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

export default function CreateEventScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [useRankPrices, setUseRankPrices] = useState(false);
  const [priceRegular, setPriceRegular] = useState("");
  const [priceSilver, setPriceSilver] = useState("");
  const [priceGold, setPriceGold] = useState("");
  const [pricePlatinum, setPricePlatinum] = useState("");
  const [category, setCategory] = useState<"kanto" | "kansai">("kanto");
  const [eventType, setEventType] = useState<Event["eventType"]>("official");

  if (authUser?.role !== "admin") {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name="shield.fill" size={48} color={colors.border} />
          <Text style={{ fontSize: 16, color: colors.muted, marginTop: 12 }}>
            管理者のみイベントを作成できます
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const handleCreate = () => {
    if (!title.trim() || !date.trim() || !time.trim() || !location.trim()) {
      Alert.alert("入力エラー", "必須項目を入力してください");
      return;
    }
    // 日付形式バリデーション (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      Alert.alert("日付形式エラー", "日付はYYYY-MM-DD形式で入力してください（例: 2026-04-15）");
      return;
    }
    const rankPricesData = useRankPrices && (priceRegular || priceSilver || priceGold || pricePlatinum)
      ? {
          ...(priceRegular.trim() ? { regular: priceRegular.trim() } : {}),
          ...(priceSilver.trim() ? { silver: priceSilver.trim() } : {}),
          ...(priceGold.trim() ? { gold: priceGold.trim() } : {}),
          ...(pricePlatinum.trim() ? { platinum: pricePlatinum.trim() } : {}),
        }
      : undefined;
    const newEvent: Event = {
      id: `event_${Date.now()}`,
      title: title.trim(),
      description: description.trim() || "説明なし",
      date: date.trim(),
      time: time.trim(),
      location: location.trim(),
      image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400",
      capacity: parseInt(capacity) || 20,
      attendees: 0,
      participants: [],
      price: price.trim() || "無料",
      ...(rankPricesData ? { rankPrices: rankPricesData } : {}),
      category,
      eventType,
      status: "open",
      createdBy: CURRENT_USER.id,
    };
    pendingEvents.unshift(newEvent);
    Alert.alert("作成完了", `「${newEvent.title}」を作成しました。イベント一覧に表示されます。`, [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  const categories = [
    { key: "kanto" as const, label: "関東" },
    { key: "kansai" as const, label: "関西" },
  ];
  const eventTypes = [
    { key: "official" as const, label: "公式イベント" },
    { key: "gourmet" as const, label: "グルメ会" },
  ];

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
          イベント作成
        </Text>
        <Pressable onPress={handleCreate}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#E8A0BF" }}>作成</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Title */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
          イベント名 *
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="例: 第10回 焼肉会"
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

        {/* Description */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
          説明
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="イベントの説明..."
          placeholderTextColor={colors.muted}
          multiline
          textAlignVertical="top"
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 15,
            color: colors.foreground,
            minHeight: 100,
            marginBottom: 16,
          }}
        />

        {/* Date and Time */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
              日付 *
            </Text>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="2026-04-15"
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: colors.foreground,
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
              時間 *
            </Text>
            <TextInput
              value={time}
              onChangeText={setTime}
              placeholder="19:00"
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: colors.foreground,
              }}
            />
          </View>
        </View>

        {/* Location */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
          場所 *
        </Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="例: 東京都渋谷区..."
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

        {/* Capacity and Price */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
              定員
            </Text>
            <TextInput
              value={capacity}
              onChangeText={setCapacity}
              placeholder="20"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: colors.foreground,
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
              参加費
            </Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="¥5,000"
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: colors.foreground,
              }}
            />
          </View>
        </View>

        {/* ランク別料金トグル */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: colors.surface,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: useRankPrices ? 12 : 16,
          }}
        >
          <View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>ランク別料金を設定する</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>ランクごとに異なる参加費を設定</Text>
          </View>
          <Pressable
            onPress={() => setUseRankPrices(!useRankPrices)}
            style={{
              width: 51,
              height: 31,
              borderRadius: 15.5,
              backgroundColor: useRankPrices ? "#E8A0BF" : colors.border,
              justifyContent: "center",
              paddingHorizontal: 2,
            }}
          >
            <View
              style={{
                width: 27,
                height: 27,
                borderRadius: 13.5,
                backgroundColor: "#FFF",
                alignSelf: useRankPrices ? "flex-end" : "flex-start",
              }}
            />
          </Pressable>
        </View>

        {/* ランク別料金入力フォーム */}
        {useRankPrices && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, marginBottom: 10 }}>
              入力しないランクはデフォルト参加費が適用されます
            </Text>
            {([
              { key: "regular", label: "レギュラー", value: priceRegular, setter: setPriceRegular },
              { key: "silver", label: "シルバー", value: priceSilver, setter: setPriceSilver },
              { key: "gold", label: "ゴールド", value: priceGold, setter: setPriceGold },
              { key: "platinum", label: "プラチナ", value: pricePlatinum, setter: setPricePlatinum },
            ] as const).map(({ key, label, value, setter }) => (
              <View key={key} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ width: 72, fontSize: 13, fontWeight: "600", color: colors.foreground }}>{label}</Text>
                <TextInput
                  value={value}
                  onChangeText={setter}
                  placeholder="¥4,000"
                  placeholderTextColor={colors.muted}
                  style={{
                    flex: 1,
                    backgroundColor: colors.background,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    fontSize: 14,
                    color: colors.foreground,
                  }}
                />
              </View>
            ))}
          </View>
        )}

        {/* Event type */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
          イベント種別
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          {eventTypes.map((type) => (
            <Pressable
              key={type.key}
              onPress={() => setEventType(type.key)}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: eventType === type.key ? "#A7C7E7" : colors.surface,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "600",
                  color: eventType === type.key ? "#FFF" : colors.foreground,
                }}
              >
                {type.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Category */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
          エリア
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
          {categories.map((cat) => (
            <Pressable
              key={cat.key}
              onPress={() => setCategory(cat.key)}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: category === cat.key ? "#E8A0BF" : colors.surface,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "600",
                  color: category === cat.key ? "#FFF" : colors.foreground,
                }}
              >
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
          ※ 管理者のみがイベントを作成できます
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}
