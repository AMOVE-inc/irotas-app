import { IconSymbol } from "@/components/ui/icon-symbol";
import type { ImageProps } from "expo-image";
import { AuthenticatedImage as Image, resolveMediaUrl } from "@/components/authenticated-image";
import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Modal, Platform, Pressable, Text, View } from "react-native";

type ExpandableImageProps = Pick<ImageProps, "source" | "style" | "contentFit" | "onLoad"> & {
  uri?: string;
  accessibilityLabel?: string;
  galleryUris?: string[];
  galleryIndex?: number;
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
export function ExpandableImage({ source, style, contentFit = "cover", onLoad, uri, galleryUris, galleryIndex = 0, accessibilityLabel = "画像を拡大表示" }: ExpandableImageProps) {
  const [visible, setVisible] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(galleryIndex);
  const touchStartX = useRef(0);
  const rawUri = uri ?? (typeof source === "string" ? source : source && typeof source === "object" && !Array.isArray(source) && "uri" in source && typeof source.uri === "string" ? source.uri : undefined);
  const resolvedUri = rawUri ? resolveMediaUrl(rawUri) : undefined;
  const activeUri = galleryUris?.[activeIndex] ? resolveMediaUrl(galleryUris[activeIndex]) : resolvedUri;
  const activeSource = activeUri ? { uri: activeUri } : source;
  useEffect(() => { setImageFailed(false); }, [resolvedUri]);
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVisible(false);
      if (event.key === "ArrowRight") setActiveIndex((index) => Math.min((galleryUris?.length ?? 1) - 1, index + 1));
      if (event.key === "ArrowLeft") setActiveIndex((index) => Math.max(0, index - 1));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, galleryUris?.length]);

  return <>
    <Pressable onPress={(event) => { event.stopPropagation(); if (imageFailed) setImageFailed(false); else { setActiveIndex(galleryIndex); setVisible(true); } }} accessibilityRole="button" accessibilityLabel={imageFailed ? "画像を再読み込み" : accessibilityLabel} style={[style as any, { overflow: "hidden" }]}>
      {imageFailed ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 8 }}><Text style={{ color: "#777", fontSize: 11 }}>画像を表示できません</Text></View>
        : <Image source={source} onLoad={onLoad} onError={() => { setImageFailed(true); setVisible(false); }} style={{ width: "100%", height: "100%" }} contentFit={contentFit} />}
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)" }} onTouchStart={(event) => { touchStartX.current = event.nativeEvent.pageX; }} onTouchEnd={(event) => { const delta = event.nativeEvent.pageX - touchStartX.current; if (Math.abs(delta) > 45) setActiveIndex((index) => Math.max(0, Math.min((galleryUris?.length ?? 1) - 1, index + (delta < 0 ? 1 : -1)))); }}>
        <Image source={activeSource} onError={() => { setImageFailed(true); setVisible(false); }} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" }} contentFit="contain" />
        {(galleryUris?.length ?? 0) > 1 ? <View style={{ position: "absolute", left: 12, right: 12, bottom: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Pressable accessibilityLabel="前の写真" onPress={() => setActiveIndex((index) => Math.max(0, index - 1))} style={{ padding: 14 }}><Text style={{ color: "#FFF", fontSize: 28 }}>‹</Text></Pressable><Text style={{ color: "#FFF", fontWeight: "800" }}>{activeIndex + 1} / {galleryUris!.length}</Text><Pressable accessibilityLabel="次の写真" onPress={() => setActiveIndex((index) => Math.min(galleryUris!.length - 1, index + 1))} style={{ padding: 14 }}><Text style={{ color: "#FFF", fontSize: 28 }}>›</Text></Pressable></View> : null}
        <View style={{ position: "absolute", top: 18, right: 16, flexDirection: "row", gap: 10 }}>
          {activeUri ? <Pressable onPress={() => void saveImage(activeUri)} accessibilityRole="button" accessibilityLabel="画像を保存" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}><IconSymbol name="square.and.arrow.down" size={22} color="#FFF" /></Pressable> : null}
          <Pressable onPress={() => setVisible(false)} accessibilityRole="button" accessibilityLabel="拡大表示を閉じる" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}><IconSymbol name="xmark" size={22} color="#FFF" /></Pressable>
        </View>
      </View>
    </Modal>
  </>;
}
