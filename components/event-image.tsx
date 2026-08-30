import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View, type ViewStyle } from "react-native";
import type { Event } from "@/constants/mock-data";

export function EventImage({ event, style }: { event: Pick<Event, "image" | "tabelogUrl" | "googleMapsUrl" | "title" | "location">; style: ViewStyle }) {
  const [resolved, setResolved] = useState(event.image || "");
  const [loading, setLoading] = useState(!event.image);
  useEffect(() => {
    setResolved(event.image || "");
    const sourceUrl = event.tabelogUrl || event.googleMapsUrl;
    if (event.image) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    const parameters = new URLSearchParams({ query: `${event.title} ${event.location}` });
    if (sourceUrl) parameters.set("url", sourceUrl);
    void fetch(`/api/link-preview?${parameters.toString()}`)
      .then((response) => response.ok ? response.json() : { imageUrl: null })
      .then((value) => { if (active && typeof value.imageUrl === "string") setResolved(value.imageUrl); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [event.googleMapsUrl, event.image, event.location, event.tabelogUrl, event.title]);
  return <View style={[style, { overflow: "hidden", backgroundColor: "#D8D8DC", alignItems: "center", justifyContent: "center" }]}>
    {resolved ? <Image source={resolved} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={250} /> : loading ? <ActivityIndicator color="#777" /> : <Text style={{ color: "#707078", fontSize: 12, fontWeight: "700" }}>画像未設定</Text>}
  </View>;
}
