import { useColors } from "@/hooks/use-colors";
import type { ReplyReference } from "@/lib/reply-reference";
import { Pressable, Text, View } from "react-native";

export function ReplyReferenceView({ reply, onCancel, onPress }: {
  reply: ReplyReference;
  onCancel?: () => void;
  onPress?: () => void;
  outgoing?: boolean;
}) {
  const colors = useColors();
  return <View style={{ borderLeftWidth: 3, borderLeftColor: "#E8A0BF", borderWidth: 1, borderColor: "#E1E2E5", backgroundColor: "#F1F2F4", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 9, marginBottom: 6, flexDirection: "row", alignItems: "center" }}>
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={onPress ? `${reply.authorName}の返信元へ移動` : undefined} style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", color: colors.foreground }}>↪ {reply.authorName} に返信</Text>
      <Text numberOfLines={2} style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{reply.excerpt}</Text>
    </Pressable>
    {onCancel ? <Pressable accessibilityRole="button" accessibilityLabel="返信を取り消す" onPress={onCancel} style={{ padding: 8 }}><Text style={{ color: colors.muted, fontSize: 18 }}>×</Text></Pressable> : null}
  </View>;
}
