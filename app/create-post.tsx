import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, type TimelinePost } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// グローバルな投稿ストア（シンプルなモジュールレベルの状態）
export const pendingPosts: TimelinePost[] = [];

export default function CreatePostScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [location, setLocation] = useState<string | null>(null);

  const handlePost = () => {
    if (!content.trim()) {
      Alert.alert("エラー", "投稿内容を入力してください");
      return;
    }

    // 新しい投稿を作成
    const newPost: TimelinePost = {
      id: `post_${Date.now()}`,
      author: CURRENT_USER,
      content: content.trim(),
      images: selectedImages,
      likes: 0,
      comments: 0,
      liked: false,
      createdAt: new Date().toISOString(),
    };

    // グローバルストアに追加
    pendingPosts.unshift(newPost);

    Alert.alert("投稿完了", "タイムラインに投稿しました！", [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  const handlePickImage = () => {
    Alert.alert("写真を追加", "写真ライブラリから選択する機能は近日公開予定です。");
  };

  const handleCamera = () => {
    Alert.alert("カメラ", "カメラ撮影機能は近日公開予定です。");
  };

  const handleLocation = () => {
    if (location) {
      setLocation(null);
      return;
    }
    Alert.alert("位置情報を追加", "現在地を投稿に追加しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "追加する",
        onPress: () => setLocation("東京都渋谷区"),
      },
    ]);
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>新規投稿</Text>
        <Pressable
          onPress={handlePost}
          style={{
            backgroundColor: content.trim() ? "#E8A0BF" : colors.border,
            borderRadius: 18,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>投稿</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* Author row */}
        <View style={{ flexDirection: "row", alignItems: "center", padding: 16 }}>
          <Image
            source={{ uri: CURRENT_USER.avatar }}
            style={{ width: 40, height: 40, borderRadius: 20 }}
          />
          <View style={{ marginLeft: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
              {CURRENT_USER.name}
            </Text>
            {location && (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                <IconSymbol name="mappin.and.ellipse" size={12} color="#E8A0BF" />
                <Text style={{ fontSize: 12, color: "#E8A0BF", marginLeft: 4 }}>{location}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Content input */}
        <View style={{ paddingHorizontal: 16, flex: 1, minHeight: 200 }}>
          <TextInput
            placeholder="今日のグルメ体験をシェアしよう..."
            placeholderTextColor={colors.muted}
            value={content}
            onChangeText={setContent}
            multiline
            autoFocus
            maxLength={500}
            style={{
              fontSize: 17,
              lineHeight: 26,
              color: colors.foreground,
              textAlignVertical: "top",
              minHeight: 200,
            }}
          />
        </View>

        {/* Selected images preview */}
        {selectedImages.length > 0 && (
          <ScrollView horizontal style={{ paddingHorizontal: 16, marginTop: 8 }}>
            {selectedImages.map((uri, i) => (
              <View key={i} style={{ marginRight: 8, position: "relative" }}>
                <Image
                  source={{ uri }}
                  style={{ width: 100, height: 100, borderRadius: 8 }}
                />
                <Pressable
                  onPress={() => setSelectedImages(selectedImages.filter((_, idx) => idx !== i))}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    backgroundColor: "rgba(0,0,0,0.5)",
                    borderRadius: 10,
                    width: 20,
                    height: 20,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#FFF", fontSize: 12 }}>✕</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
      </ScrollView>

      {/* Bottom toolbar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          paddingBottom: Platform.OS === "web" ? 16 : Math.max(insets.bottom, 12),
          borderTopWidth: 0.5,
          borderTopColor: colors.border,
        }}
      >
        <Pressable onPress={handlePickImage} style={{ marginRight: 20 }}>
          <IconSymbol name="photo.fill" size={24} color="#E8A0BF" />
        </Pressable>
        <Pressable onPress={handleCamera} style={{ marginRight: 20 }}>
          <IconSymbol name="camera.fill" size={24} color="#E8A0BF" />
        </Pressable>
        <Pressable onPress={handleLocation}>
          <IconSymbol
            name="mappin.and.ellipse"
            size={24}
            color={location ? "#E8A0BF" : colors.muted}
          />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 13, color: content.length > 450 ? colors.error : colors.muted }}>
          {content.length}/500
        </Text>
      </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
