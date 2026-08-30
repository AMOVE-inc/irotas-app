import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, type TimelinePost } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
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

// グローバルな投稿ストア（シンプルなモジュールレベルの状態）
export const pendingPosts: TimelinePost[] = [];

export default function CreatePostScreen() {
  const colors = useColors();
  const router = useRouter();
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

  const handlePickImage = async () => {
    if (selectedImages.length >= 4) {
      Alert.alert("上限に達しました", "写真は4枚まで追加できます。");
      return;
    }

    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("権限が必要です", "写真ライブラリへのアクセスを許可してください。");
        return;
      }
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 4 - selectedImages.length,
        quality: 0.8,
      });

      if (!result.canceled) {
        const uris = result.assets.map((asset) => asset.uri);
        setSelectedImages((current) => [...current, ...uris].slice(0, 4));
      }
    } catch {
      Alert.alert("写真を選択できませんでした", "ブラウザを更新して、もう一度お試しください。");
    }
  };

  const handleCamera = async () => {
    if (selectedImages.length >= 4) {
      Alert.alert("上限に達しました", "写真は4枚まで追加できます。");
      return;
    }

    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("権限が必要です", "カメラへのアクセスを許可してください。");
        return;
      }
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setSelectedImages((current) => [...current, result.assets[0].uri].slice(0, 4));
      }
    } catch {
      Alert.alert("カメラを起動できませんでした", "端末のカメラ権限をご確認ください。");
    }
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
            source={typeof CURRENT_USER.avatar === "string" ? { uri: CURRENT_USER.avatar } : CURRENT_USER.avatar}
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

        {/* Media toolbar: kept above the editor so mobile keyboards cannot hide it */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingBottom: 10,
            gap: 8,
          }}
        >
          <Pressable
            onPress={handlePickImage}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#F8EFF3",
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <IconSymbol name="photo.fill" size={18} color="#D97FA8" />
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#D97FA8", marginLeft: 5 }}>
              写真
            </Text>
          </Pressable>
          <Pressable
            onPress={handleCamera}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#EEF6FB",
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <IconSymbol name="camera.fill" size={18} color="#72ACD1" />
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#5C98BE", marginLeft: 5 }}>
              撮影
            </Text>
          </Pressable>
          <Pressable
            onPress={handleLocation}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: location ? "#F8EFF3" : colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconSymbol
              name="mappin.and.ellipse"
              size={19}
              color={location ? "#D97FA8" : colors.muted}
            />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Text style={{ fontSize: 12, color: colors.muted }}>{selectedImages.length}/4枚</Text>
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

      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <Text style={{ fontSize: 12, color: content.length > 450 ? colors.error : colors.muted, textAlign: "right" }}>
          {content.length}/500
        </Text>
      </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
