import { IconSymbol } from "@/components/ui/icon-symbol";
import { useVideoPlayer, VideoView } from "expo-video";
import { Alert, Linking, Platform, Pressable, View, type ViewStyle } from "react-native";

async function saveVideo(uri: string) {
  try {
    if (Platform.OS === "web") {
      const response = await fetch(uri, { credentials: "include" });
      if (!response.ok) throw new Error("video download failed");
      const blob = await response.blob();
      const extension = blob.type.includes("quicktime") ? "mov" : blob.type.includes("webm") ? "webm" : "mp4";
      const file = new File([blob], `irotas-video-${Date.now()}.${extension}`, { type: blob.type || "video/mp4" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file] });
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return;
    }
    await Linking.openURL(uri);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return;
    if (Platform.OS === "web") window.open(uri, "_blank", "noopener,noreferrer");
    else Alert.alert("保存できませんでした", "動画を開いて端末の保存操作をお試しください。");
  }
}

export function SaveableVideo({ uri, style }: { uri: string; style: ViewStyle }) {
  const player = useVideoPlayer(uri);
  return (
    <View style={[style, { overflow: "hidden", position: "relative", backgroundColor: "#111" }]}>
      <VideoView player={player} nativeControls style={{ width: "100%", height: "100%" }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="動画を保存"
        onPress={() => void saveVideo(uri)}
        style={{ position: "absolute", top: 9, right: 9, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.62)" }}
      >
        <IconSymbol name="square.and.arrow.down" size={20} color="#FFF" />
      </Pressable>
    </View>
  );
}
