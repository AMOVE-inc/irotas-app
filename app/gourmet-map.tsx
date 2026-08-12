import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  CURRENT_USER,
  type Restaurant,
} from "@/constants/mock-data";
import { GOURMET_MAP_SEED } from "@/constants/gourmet-map-seed";
import { useAuthContext } from "@/lib/auth-context";
import { mergeGourmetMapRestaurants, previewGourmetMapCsv, type GourmetMapImportPreview } from "@/lib/gourmet-map-csv";
import { fetchGourmetMapFeed, mergeGourmetMapFeed } from "@/lib/gourmet-map-feed";
import { setCommunityRestaurantPublished } from "@/lib/gourmet-map-community";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { GOOGLE_GOURMET_MAP_LISTS } from "@/constants/external-links";

const SEEDED_RESTAURANTS: Restaurant[] = GOURMET_MAP_SEED.map((restaurant) => ({
  ...restaurant,
  sourceCategories: [...restaurant.sourceCategories],
  registeredBy: CURRENT_USER,
}));

function RestaurantCard({
  restaurant,
  onPress,
}: {
  restaurant: Restaurant;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface,
        borderRadius: 14,
        marginHorizontal: 16,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      <Image
        source={restaurant.image}
        style={{ width: 100, height: 100 }}
        contentFit="cover"
        transition={300}
      />
      <View style={{ flex: 1, padding: 12, justifyContent: "center" }}>
        <Text
          style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}
          numberOfLines={1}
        >
          {restaurant.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3, flexWrap: "wrap" }}>
          <View
            style={{
              backgroundColor: "#E8A0BF20",
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 2,
              marginRight: 6,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#E8A0BF" }}>
              {restaurant.genre}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconSymbol name="star.fill" size={12} color="#FFD700" />
            <Text style={{ fontSize: 12, color: colors.foreground, marginLeft: 3 }}>
              {restaurant.rating}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 2 }}>
              ({restaurant.reviewCount})
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
          {restaurant.address}
        </Text>
      </View>
    </Pressable>
  );
}

function RestaurantDetail({
  restaurant,
  onClose,
  onOpenSource,
  canManage,
  onUnpublish,
}: {
  restaurant: Restaurant;
  onClose: () => void;
  onOpenSource: () => void;
  canManage: boolean;
  onUnpublish: () => void;
}) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header image */}
      <View>
        <Image
          source={restaurant.image}
          style={{ width: "100%", height: 220 }}
          contentFit="cover"
        />
        <Pressable
          onPress={onClose}
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
          <IconSymbol name="xmark" size={18} color="#FFF" />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: "800", color: colors.foreground, marginBottom: 4 }}>
              {restaurant.name}
            </Text>
            <View
              style={{
                backgroundColor: "#E8A0BF20",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 3,
                alignSelf: "flex-start",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#E8A0BF" }}>
                {restaurant.genre}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <IconSymbol name="star.fill" size={20} color="#FFD700" />
              <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, marginLeft: 4 }}>
                {restaurant.rating}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {restaurant.reviewCount}件のレビュー
            </Text>
          </View>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <IconSymbol name="mappin.and.ellipse" size={18} color="#E8A0BF" />
            <Text style={{ fontSize: 14, color: colors.foreground, marginLeft: 10, flex: 1 }}>
              {restaurant.address}
            </Text>
          </View>
          {restaurant.phone && (
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <IconSymbol name="phone.fill" size={18} color="#E8A0BF" />
              <Text style={{ fontSize: 14, color: colors.foreground, marginLeft: 10 }}>
                {restaurant.phone}
              </Text>
            </View>
          )}
          {restaurant.price ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <IconSymbol name="yensign.circle.fill" size={18} color="#E8A0BF" />
              <Text style={{ fontSize: 14, color: colors.foreground, marginLeft: 10 }}>{restaurant.price}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconSymbol name="person.fill" size={18} color="#E8A0BF" />
            <Text style={{ fontSize: 14, color: colors.foreground, marginLeft: 10 }}>
              登録者: {restaurant.registeredBy.name}
            </Text>
          </View>
        </View>

        {restaurant.description && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
              おすすめポイント
            </Text>
            <Text style={{ fontSize: 15, lineHeight: 22, color: colors.foreground }}>
              {restaurant.description}
            </Text>
          </View>
        )}
        {restaurant.googleMapsUrl ? (
          <Pressable
            onPress={() => Linking.openURL(restaurant.googleMapsUrl!)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#4285F4", borderRadius: 14, paddingVertical: 14, marginBottom: 24 }}
          >
            <IconSymbol name="map.fill" size={18} color="#FFF" />
            <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "800", marginLeft: 8 }}>Googleマップで見る</Text>
          </Pressable>
        ) : null}
        {restaurant.sourceType === "meal_report" ? (
          <View style={{ marginTop: -12, marginBottom: 24 }}>
            <View style={{ alignSelf: "flex-start", backgroundColor: "#FFF2E8", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10 }}>
              <Text style={{ color: "#C56537", fontSize: 12, fontWeight: "800" }}>メンバー高評価店　★{restaurant.memberRating}</Text>
            </View>
            <Pressable onPress={onOpenSource} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 13 }}>
              <IconSymbol name="bubble.left.and.bubble.right.fill" size={17} color="#5B5A73" />
              <Text style={{ color: "#5B5A73", fontSize: 14, fontWeight: "800", marginLeft: 7 }}>元のごちそうさま報告を見る</Text>
            </Pressable>
            {canManage ? <Pressable onPress={onUnpublish} style={{ alignItems: "center", paddingVertical: 12, marginTop: 6 }}><Text style={{ color: "#C94B55", fontSize: 13, fontWeight: "700" }}>グルメマップへの掲載を解除</Text></Pressable> : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function CSVImportModal({
  visible,
  restaurants,
  onClose,
  onImport,
}: {
  visible: boolean;
  restaurants: Restaurant[];
  onClose: () => void;
  onImport: (restaurants: Restaurant[]) => void;
}) {
  const colors = useColors();
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("");
  const [sourceList, setSourceList] = useState("居酒屋");
  const [preview, setPreview] = useState<GourmetMapImportPreview | null>(null);

  const analyze = (text = csvText, list = sourceList) => {
    if (!text.trim()) {
      Alert.alert("エラー", "CSVデータを入力してください");
      return;
    }
    setPreview(previewGourmetMapCsv(text, list, CURRENT_USER, restaurants));
  };

  const selectFile = () => {
    if (Platform.OS !== "web") return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const inferredList = file.name.replace(/\.csv$/i, "").replace(/^\d{6,8}[_-]?/, "") || "未分類";
      setFilename(file.name);
      setCsvText(text);
      setSourceList(inferredList);
      setPreview(previewGourmetMapCsv(text, inferredList, CURRENT_USER, restaurants));
    };
    input.click();
  };

  const resetAndClose = () => {
    setCsvText("");
    setFilename("");
    setSourceList("居酒屋");
    setPreview(null);
    onClose();
  };

  const handleImport = () => {
    if (!preview || preview.valid.length === 0 || preview.missingHeaders.length > 0) return;
    onImport(preview.valid);
    Alert.alert("取り込み完了", `${preview.valid.length}件を追加しました。${preview.duplicateCount > 0 ? ` 重複${preview.duplicateCount}件は除外しました。` : ""}`);
    resetAndClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={resetAndClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 12,
            borderBottomWidth: 0.5,
            borderBottomColor: colors.border,
          }}
        >
          <Pressable onPress={resetAndClose}>
            <Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
            CSV取り込み
          </Text>
          <View style={{ width: 64 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={{ backgroundColor: "#A7C7E710", borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
              CSVフォーマット
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
              1行目: ヘッダー行{"\n"}
              G Maps Extractorから出力したCSVに対応しています。{"\n"}
              メモ内の改行を含むCSVも正しく解析し、Place ID・GoogleマップURL・店名＋住所の順で重複を除外します。
            </Text>
          </View>
          {Platform.OS === "web" ? (
            <Pressable onPress={selectFile} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#5B5A73", borderRadius: 14, paddingVertical: 14, marginBottom: 14 }}>
              <IconSymbol name="doc.fill" size={17} color="#FFF" />
              <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "800", marginLeft: 8 }}>CSVファイルを選択</Text>
            </Pressable>
          ) : null}
          {filename ? <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>選択中：{filename}</Text> : null}
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>保存リスト名</Text>
          <TextInput value={sourceList} onChangeText={(value) => { setSourceList(value); setPreview(null); }} placeholder="居酒屋" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 13, fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border, marginBottom: 14 }} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
            CSVデータを貼り付けても確認できます
          </Text>
          <TextInput
            value={csvText}
            onChangeText={setCsvText}
            placeholder="CSVデータをここに貼り付けてください..."
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 14,
              fontSize: 13,
              color: colors.foreground,
            minHeight: 120,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
          <Pressable onPress={() => analyze()} style={{ alignItems: "center", backgroundColor: "#EAF5FA", borderRadius: 12, paddingVertical: 12, marginTop: 12 }}><Text style={{ color: "#4E8FBE", fontSize: 14, fontWeight: "800" }}>取込内容を確認</Text></Pressable>
          {preview ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground, marginBottom: 10 }}>取込プレビュー</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                {[{ label: "取込可能", value: preview.valid.length, color: "#2E8B57" }, { label: "重複", value: preview.duplicateCount, color: "#C58A24" }, { label: "要確認", value: preview.errors.length, color: "#C94B55" }].map((item) => <View key={item.label} style={{ flex: 1, backgroundColor: `${item.color}12`, borderRadius: 12, padding: 10 }}><Text style={{ fontSize: 11, color: colors.muted }}>{item.label}</Text><Text style={{ fontSize: 22, fontWeight: "900", color: item.color }}>{item.value}</Text></View>)}
              </View>
              {preview.missingHeaders.length > 0 ? <View style={{ backgroundColor: "#FDECEE", borderRadius: 12, padding: 12, marginBottom: 10 }}><Text style={{ color: "#B53A45", fontWeight: "800" }}>不足している列</Text><Text style={{ color: "#B53A45", marginTop: 4 }}>{preview.missingHeaders.join("、")}</Text></View> : null}
              {preview.errors.slice(0, 5).map((error) => <View key={`${error.row}-${error.name}`} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }}><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{error.row}行目：{error.name}</Text><Text style={{ fontSize: 12, color: "#C94B55", marginTop: 2 }}>{error.reasons.join("、")}</Text></View>)}
              {preview.valid.slice(0, 3).map((restaurant) => <View key={restaurant.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}><Image source={{ uri: restaurant.image }} style={{ width: 44, height: 44, borderRadius: 8 }} contentFit="cover" /><View style={{ flex: 1, marginLeft: 10 }}><Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }}>{restaurant.name}</Text><Text numberOfLines={1} style={{ fontSize: 11, color: colors.muted }}>{restaurant.address}</Text></View></View>)}
              <Pressable onPress={handleImport} disabled={preview.valid.length === 0 || preview.missingHeaders.length > 0} style={{ alignItems: "center", backgroundColor: preview.valid.length > 0 && preview.missingHeaders.length === 0 ? "#E8A0BF" : colors.border, borderRadius: 14, paddingVertical: 14, marginTop: 12 }}><Text style={{ color: "#FFF", fontSize: 15, fontWeight: "900" }}>{preview.valid.length}件を取り込む</Text></Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function GourmetMapScreen() {
  const colors = useColors();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>(SEEDED_RESTAURANTS);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState<string | null>(null);
  const { user: authUser } = useAuthContext();
  const userIsAdmin = authUser?.role === "admin";

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let active = true;
    fetchGourmetMapFeed()
      .then((feed) => {
        if (!active || !feed || feed.restaurants.length === 0) return;
        setRestaurants((current) => mergeGourmetMapFeed(current, feed.restaurants, CURRENT_USER));
        setFeedUpdatedAt(feed.updatedAt);
      })
      .catch(() => {
        // 公開フィードが未設定・一時停止中でも、同梱済みの店舗データを表示する。
      });
    return () => { active = false; };
  }, []);

  const updateLabel = useMemo(() => {
    const date = feedUpdatedAt ? new Date(feedUpdatedAt) : new Date("2026-08-01T00:00:00+09:00");
    return `${date.getFullYear()}年${date.getMonth() + 1}月更新`;
  }, [feedUpdatedAt]);

  const genres = useMemo(() => [...new Set(restaurants.map((restaurant) => restaurant.genre))].sort(), [restaurants]);
  const filteredRestaurants = restaurants.filter((r) => {
    const matchSearch =
      !searchQuery ||
      r.name.includes(searchQuery) ||
      r.address.includes(searchQuery) ||
      r.genre.includes(searchQuery) ||
      r.sourceCategories?.some((category) => category.includes(searchQuery));
    const matchGenre = !selectedGenre || r.genre === selectedGenre;
    return matchSearch && matchGenre;
  });

  const renderItem = useCallback(
    ({ item }: { item: Restaurant }) => (
      <RestaurantCard restaurant={item} onPress={() => setSelectedRestaurant(item)} />
    ),
    [],
  );

  return (
    <ScreenContainer>
      {/* Header with back button */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 8,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
            <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>
            グルメマップ
          </Text>
        </View>
        {userIsAdmin && (
          <Pressable
            onPress={() => setShowCSVImport(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#A7C7E7",
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 7,
            }}
          >
            <IconSymbol name="square.and.arrow.down" size={14} color="#FFF" />
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF", marginLeft: 4 }}>
              CSV取込
            </Text>
          </Pressable>
        )}
      </View>

      <View style={{ marginTop: 12 }}>
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>Google保存リスト</Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 3 }}>
            ジャンルを選ぶと、Google Maps側で更新された最新の保存リストを開きます
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }} style={{ flexGrow: 0 }}>
          {GOOGLE_GOURMET_MAP_LISTS.map(([label, url]) => (
            <Pressable
              key={label}
              onPress={async () => {
                try {
                  await Linking.openURL(url);
                } catch {
                  Alert.alert("リンクを開けませんでした", "運営へお問い合わせください。");
                }
              }}
              style={({ pressed }) => ({
                width: 150,
                minHeight: 72,
                borderRadius: 14,
                padding: 12,
                backgroundColor: "#EEF7F0",
                borderWidth: 1,
                borderColor: "#D6E9DA",
                justifyContent: "space-between",
                opacity: pressed ? 0.78 : 1,
              })}
            >
              <IconSymbol name="map.fill" size={18} color="#4285F4" />
              <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, fontWeight: "800", color: colors.foreground, marginTop: 7 }}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ marginHorizontal: 16, marginTop: 10, backgroundColor: "#FFF7E8", borderRadius: 12, padding: 11, flexDirection: "row", alignItems: "center" }}>
          <IconSymbol name="checkmark.circle.fill" size={17} color="#C58A24" />
          <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, lineHeight: 17, color: colors.foreground }}><Text style={{ fontWeight: "900" }}>{updateLabel}</Text>　居酒屋リスト {restaurants.filter((restaurant) => restaurant.sourceList === "居酒屋").length}件</Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, flexShrink: 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surface,
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 42,
          }}
        >
          <IconSymbol name="magnifyingglass" size={18} color={colors.muted} />
          <TextInput
            placeholder="店名・エリア・ジャンルで検索"
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={{
              flex: 1,
              marginLeft: 8,
              fontSize: 15,
              color: colors.foreground,
            }}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <IconSymbol name="xmark" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Genre filter */}
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
        style={{ flexGrow: 0, flexShrink: 0, height: 56 }}
      >
        {[{ label: "すべて", value: null }, ...genres.map((g) => ({ label: g, value: g }))].map((item) => {
          const isActive = item.value === null ? !selectedGenre : selectedGenre === item.value;
          return (
            <Pressable
              key={item.label}
              onPress={() => setSelectedGenre(item.value === null ? null : (item.value === selectedGenre ? null : item.value))}
              style={{
                height: 36,
                paddingHorizontal: 16,
                borderRadius: 18,
                backgroundColor: isActive ? "#E8A0BF" : colors.surface,
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

      {/* Restaurant count */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexShrink: 0 }}>
        <Text style={{ fontSize: 13, color: colors.muted }}>
          {filteredRestaurants.length}件の厳選グルメスポット
        </Text>
      </View>

      {/* Restaurant list */}
      <FlatList
        data={filteredRestaurants}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <IconSymbol name="map.fill" size={48} color={colors.border} />
            <Text style={{ fontSize: 15, color: colors.muted, marginTop: 12 }}>
              該当する店舗がありません
            </Text>
          </View>
        }
      />

      {/* Restaurant Detail Modal */}
      <Modal
        visible={!!selectedRestaurant}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedRestaurant(null)}
      >
        {selectedRestaurant && (
          <RestaurantDetail
            restaurant={selectedRestaurant}
            onClose={() => setSelectedRestaurant(null)}
            canManage={userIsAdmin}
            onOpenSource={() => {
              setSelectedRestaurant(null);
              router.push({ pathname: "/board", params: { category: "meal-report", view: "threads" } });
            }}
            onUnpublish={() => {
              const restaurant = selectedRestaurant;
              Alert.alert("掲載を解除しますか？", `${restaurant.name}をグルメマップから非表示にします。`, [
                { text: "キャンセル", style: "cancel" },
                { text: "解除する", style: "destructive", onPress: () => {
                  void setCommunityRestaurantPublished(restaurant.id, false).then(() => {
                    setRestaurants((current) => current.filter((item) => item.id !== restaurant.id));
                    setSelectedRestaurant(null);
                  }).catch(() => Alert.alert("エラー", "掲載状態を変更できませんでした。"));
                } },
              ]);
            }}
          />
        )}
      </Modal>

      {/* CSV Import Modal */}
      <CSVImportModal
        visible={showCSVImport}
        restaurants={restaurants}
        onClose={() => setShowCSVImport(false)}
        onImport={(incoming) => setRestaurants((current) => mergeGourmetMapRestaurants(current, incoming))}
      />
    </ScreenContainer>
  );
}
