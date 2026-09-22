import { openExternalUrl } from "@/lib/open-external-url";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import type { ImportedLinkPreview } from "@/lib/discord-link-preview";

export function BoardLinkPreviewCard({ preview }: { preview: ImportedLinkPreview }) {
  const [metadata, setMetadata] = useState<{ title: string | null; description: string | null; imageUrl: string | null }>({ title: null, description: null, imageUrl: preview.imageUrl ?? null });
  useEffect(() => {
    setMetadata({ title: null, description: null, imageUrl: preview.imageUrl ?? null });
    if (preview.provider !== "Google マップ" && preview.provider !== "食べログ") return;
    if (typeof window === "undefined") return;
    let active = true;
    const query = preview.title.endsWith("のリンクを開く") ? "" : preview.title;
    const params = new URLSearchParams({ url: preview.url, query });
    void fetch(`/api/link-preview?${params}`)
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (active && result) setMetadata({ title: typeof result.title === "string" ? result.title : null, description: typeof result.description === "string" ? result.description : null, imageUrl: typeof result.imageUrl === "string" ? result.imageUrl : preview.imageUrl ?? null }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [preview.url, preview.title, preview.imageUrl, preview.provider]);

  const title = preview.title.endsWith("のリンクを開く") ? metadata.title ?? preview.title : preview.title;
  const description = preview.description === preview.url ? metadata.description ?? preview.description : preview.description ?? metadata.description;
  const imageUrl = metadata.imageUrl;

  return <Pressable onPress={() => void openExternalUrl(preview.url)} accessibilityRole="link" accessibilityLabel={`${preview.provider}で${title}を開く`} style={{ borderWidth: 1, borderColor: "#E2E3E8", borderLeftWidth: 4, borderRadius: 9, overflow: "hidden", marginTop: 8, flexDirection: "row", backgroundColor: "#FFF" }}>
    <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, justifyContent: "center" }}>
      <Text style={{ color: "#6D7080", fontSize: 11, fontWeight: "700" }}>{preview.provider}</Text>
      <Text numberOfLines={2} style={{ color: "#2065B7", fontSize: 14, fontWeight: "800", marginTop: 3 }}>{title}</Text>
      {description ? <Text numberOfLines={2} style={{ color: "#555A65", fontSize: 12, marginTop: 4 }}>{description}</Text> : null}
    </View>
    {imageUrl ? <Image source={imageUrl} style={{ width: 100, minHeight: 96 }} contentFit="cover" /> : null}
  </Pressable>;
}
