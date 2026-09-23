import { AuthenticatedImage as Image } from "@/components/authenticated-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View, type ViewStyle } from "react-native";
import { getEventImageQuery, getEventPreviewUrl, type EventImageSource } from "@/lib/event-image-source";
import { sharedJsonRequest } from "@/lib/shared-request";

export function EventImage({ event, style }: { event: EventImageSource; style: ViewStyle }) {
  const [resolved, setResolved] = useState(event.image || "");
  const [loading, setLoading] = useState(!event.image);
  useEffect(() => {
    setResolved(event.image || "");
    const sourceUrl = getEventPreviewUrl(event);
    if (event.image || !sourceUrl) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    const parameters = new URLSearchParams({ query: getEventImageQuery(event), url: sourceUrl });
    void sharedJsonRequest<{ imageUrl?: string | null }>(`/api/link-preview?${parameters.toString()}`)
      .then((value) => { if (active && typeof value.imageUrl === "string") setResolved(value.imageUrl); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // Every event field read by this effect is listed to avoid refetching on an unrelated object identity change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.googleMapsUrl, event.image, event.location, event.restaurantName, event.tabelogUrl, event.title]);
  return <View style={[style, { overflow: "hidden", backgroundColor: "#D8D8DC", alignItems: "center", justifyContent: "center" }]}>
    {resolved ? <Image source={resolved} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={250} /> : loading ? <ActivityIndicator color="#777" /> : <Text style={{ color: "#707078", fontSize: 12, fontWeight: "700" }}>画像未設定</Text>}
  </View>;
}
