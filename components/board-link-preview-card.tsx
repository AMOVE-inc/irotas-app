import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import type { ImportedLinkPreview } from "@/lib/discord-link-preview";

export function BoardLinkPreviewCard({ preview }: { preview: ImportedLinkPreview }) {
  const [imageUrl, setImageUrl] = useState<string | null>(preview.imageUrl ?? null);
  useEffect(() => {
    if (preview.imageUrl) { setImageUrl(preview.imageUrl); return; }
    if (typeof window === "undefined") return;
    let active = true;
    const params = new URLSearchParams({ url: preview.url, query: preview.title });
    void fetch(`/api/link-preview?${params}`)
      .then((response) => response.ok ? response.json() : { imageUrl: null })
      .then((result) => { if (active) setImageUrl(typeof result.imageUrl === "string" ? result.imageUrl : null); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [preview.url, preview.title, preview.imageUrl]);

  return <Pressable onPress={() => void Linking.openURL(preview.url)} accessibilityRole="link" accessibilityLabel={`${preview.provider}で${preview.title}を開く`} style={{ borderWidth: 1, borderColor: "#E2E3E8", borderLeftWidth: 4, borderRadius: 9, overflow: "hidden", marginTop: 8, flexDirection: "row", backgroundColor: "#FFF" }}>
    <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, justifyContent: "center" }}>
      <Text style={{ color: "#6D7080", fontSize: 11, fontWeight: "700" }}>{preview.provider}</Text>
      <Text numberOfLines={2} style={{ color: "#2065B7", fontSize: 14, fontWeight: "800", marginTop: 3 }}>{preview.title}</Text>
      {preview.description ? <Text numberOfLines={2} style={{ color: "#555A65", fontSize: 12, marginTop: 4 }}>{preview.description}</Text> : null}
    </View>
    {imageUrl ? <Image source={imageUrl} style={{ width: 100, minHeight: 96 }} contentFit="cover" /> : null}
  </Pressable>;
}
