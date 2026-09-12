import { IconSymbol } from "@/components/ui/icon-symbol";
import { Image, type ImageProps } from "expo-image";
import { useState } from "react";
import { Alert, Linking, Modal, Platform, Pressable, View } from "react-native";

type ExpandableImageProps = Pick<ImageProps, "source" | "style" | "contentFit"> & {
  uri?: string;
  accessibilityLabel?: string;
};

async function saveImage(uri: string) {
  try {
    if (Platform.OS === "web") {
      const response = await fetch(uri);
      if (!response.ok) throw new Error("image download failed");
      const blob = await response.blob();
      const file = new File([blob], `irotas-image-${Date.now()}.${blob.type.includes("png") ? "png" : "jpg"}`, { type: blob.type || "image/jpeg" });
      // Mobile Safari cannot silently write Photos; its share sheet offers
      // 「画像を保存」, whereas an anchor download goes to Files.
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file] });
        return;
      }
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
      window.alert("画像を長押しして「写真に保存」を選択してください。");
      return;
    }
    await Linking.openURL(uri);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return;
    if (Platform.OS === "web") window.open(uri, "_blank", "noopener,noreferrer");
    else Alert.alert("保存できませんでした", "画像を開いて端末の保存操作をお試しください。");
  }
}

/** 投稿・コメント・チャットの画像を、タップで全画面表示して保存できるようにする。 */
export function ExpandableImage({ source, style, contentFit = "cover", uri, accessibilityLabel = "画像を拡大表示" }: ExpandableImageProps) {
  const [visible, setVisible] = useState(false);
  const resolvedUri = uri ?? (source && typeof source === "object" && !Array.isArray(source) && "uri" in source && typeof source.uri === "string" ? source.uri : undefined);

  return <>
    <Pressable onPress={(event) => { event.stopPropagation(); setVisible(true); }} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[style as any, { overflow: "hidden" }]}>
      <Image source={source} style={{ width: "100%", height: "100%" }} contentFit={contentFit} />
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)" }}>
        <Image source={source} style={{ flex: 1, width: "100%" }} contentFit="contain" />
        <View style={{ position: "absolute", top: 18, right: 16, flexDirection: "row", gap: 10 }}>
          {resolvedUri ? <Pressable onPress={() => void saveImage(resolvedUri)} accessibilityRole="button" accessibilityLabel="画像を保存" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}><IconSymbol name="square.and.arrow.down" size={22} color="#FFF" /></Pressable> : null}
          <Pressable onPress={() => setVisible(false)} accessibilityRole="button" accessibilityLabel="拡大表示を閉じる" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}><IconSymbol name="xmark" size={22} color="#FFF" /></Pressable>
        </View>
      </View>
    </Modal>
  </>;
}
