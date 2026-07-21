import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  RESTAURANTS,
  GENRES,
  CURRENT_USER,
  type Restaurant,
} from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState, useCallback } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { GOOGLE_GOURMET_MAP_URL } from "@/constants/external-links";

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
}: {
  restaurant: Restaurant;
  onClose: () => void;
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
      </ScrollView>
    </View>
  );
}

function CSVImportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const [csvText, setCsvText] = useState("");

  const handleImport = () => {
    if (!csvText.trim()) {
      Alert.alert("エラー", "CSVデータを入力してください");
      return;
    }
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) {
      Alert.alert("エラー", "ヘッダー行とデータ行が必要です");
      return;
    }
    const count = lines.length - 1;
    Alert.alert("取り込み完了", `${count}件の店舗データを取り込みました`, [
      { text: "OK", onPress: onClose },
    ]);
    setCsvText("");
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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
          <Pressable onPress={onClose}>
            <Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
            CSV取り込み
          </Text>
          <Pressable onPress={handleImport}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#E8A0BF" }}>取り込み</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={{ backgroundColor: "#A7C7E710", borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
              CSVフォーマット
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
              1行目: ヘッダー行{"\n"}
              必須列: 店名, ジャンル, 住所{"\n"}
              任意列: 電話番号, 評価, 説明{"\n\n"}
              例:{"\n"}
              店名,ジャンル,住所,電話番号,評価{"\n"}
              焼肉太郎,焼肉,東京都渋谷区...,03-1234-5678,4.5
            </Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
            CSVデータを貼り付け
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
              minHeight: 200,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 12 }}>
            ※ 定期的にCSVファイルを取り込むことでグルメマップを更新できます
          </Text>
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
  const { user: authUser } = useAuthContext();
  const userIsAdmin = authUser?.role === "admin";

  const filteredRestaurants = RESTAURANTS.filter((r) => {
    const matchSearch =
      !searchQuery ||
      r.name.includes(searchQuery) ||
      r.address.includes(searchQuery) ||
      r.genre.includes(searchQuery);
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

      <Pressable
        onPress={async () => {
          if (!GOOGLE_GOURMET_MAP_URL) {
            Alert.alert(
              "Googleグルメマップ",
              "共有リストURLは現在準備中です。設定後、このボタンからカテゴリ別の保存リストを開けます。",
            );
            return;
          }
          try {
            await Linking.openURL(GOOGLE_GOURMET_MAP_URL);
          } catch {
            Alert.alert("リンクを開けませんでした", "運営へお問い合わせください。");
          }
        }}
        style={({ pressed }) => ({
          marginHorizontal: 16,
          marginTop: 12,
          borderRadius: 15,
          padding: 14,
          backgroundColor: "#EEF7F0",
          borderWidth: 1,
          borderColor: "#D6E9DA",
          flexDirection: "row",
          alignItems: "center",
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name="map.fill" size={21} color="#4285F4" />
        </View>
        <View style={{ flex: 1, marginLeft: 11 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>Googleグルメマップを開く</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>カテゴリ別の保存リストをGoogle Mapsで表示</Text>
        </View>
        <IconSymbol name="chevron.right" size={19} color={colors.muted} />
      </Pressable>

      {/* Search bar */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
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
        style={{ flexGrow: 0 }}
      >
        {[{ label: "すべて", value: null }, ...GENRES.map((g) => ({ label: g, value: g }))].map((item) => {
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
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
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
          />
        )}
      </Modal>

      {/* CSV Import Modal */}
      <CSVImportModal
        visible={showCSVImport}
        onClose={() => setShowCSVImport(false)}
      />
    </ScreenContainer>
  );
}
