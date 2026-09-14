import { useColors } from "@/hooks/use-colors";
import type { ReplyReference } from "@/lib/reply-reference";
import { Pressable, Text, View } from "react-native";

export function ReplyReferenceView({ reply, onCancel, outgoing = false }: {
  reply: ReplyReference;
  onCancel?: () => void;
  outgoing?: boolean;
}) {
  const colors = useColors();
  return <View style={{ borderLeftWidth: 3, borderLeftColor: outgoing ? "#FFF" : "#E8A0BF", backgroundColor: outgoing ? "rgba(255,255,255,0.16)" : colors.surface, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 9, marginBottom: 6, flexDirection: "row", alignItems: "center" }}>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", color: outgoing ? "#FFF" : colors.foreground }}>↪ {reply.authorName} に返信</Text>
      <Text numberOfLines={2} style={{ fontSize: 11, color: outgoing ? "#FFF" : colors.muted, marginTop: 2 }}>{reply.excerpt}</Text>
    </View>
    {onCancel ? <Pressable accessibilityRole="button" accessibilityLabel="返信を取り消す" onPress={onCancel} style={{ padding: 8 }}><Text style={{ color: outgoing ? "#FFF" : colors.muted, fontSize: 18 }}>×</Text></Pressable> : null}
  </View>;
}
