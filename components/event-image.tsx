import { AuthenticatedImage as Image } from "@/components/authenticated-image";
import { Text, View, type ViewStyle } from "react-native";
import type { EventImageSource } from "@/lib/event-image-source";

export function EventImage({ event, style }: { event: EventImageSource; style: ViewStyle }) {
  return <View style={[style, { overflow: "hidden", backgroundColor: "#D8D8DC", alignItems: "center", justifyContent: "center" }]}>
    {event.image ? <Image source={event.image} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={250} /> : <Text style={{ color: "#707078", fontSize: 12, fontWeight: "700" }}>画像未設定</Text>}
  </View>;
}
