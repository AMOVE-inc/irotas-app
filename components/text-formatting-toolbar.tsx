import { Pressable, ScrollView, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import type { TextFormat } from "@/lib/text-formatting";
import { MentionText } from "@/components/mention-ui";
import type { MentionGroup } from "@/lib/mentions";

const ACTIONS: { format: TextFormat; label: string; accessibilityLabel: string; style?: object }[] = [
  { format: "small", label: "中", accessibilityLabel: "文字を中サイズに" },
  { format: "large", label: "大", accessibilityLabel: "文字を大きく" },
  { format: "bold", label: "B", accessibilityLabel: "太字", style: { fontWeight: "900" } },
  { format: "underline", label: "U", accessibilityLabel: "アンダーライン", style: { textDecorationLine: "underline" } },
  { format: "strike", label: "S", accessibilityLabel: "取り消し線", style: { textDecorationLine: "line-through" } },
];

export function TextFormattingToolbar({ onFormat }: { onFormat: (format: TextFormat) => void }) {
  const colors = useColors();
  return (
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 7 }}>
      <Text style={{ fontSize: 11, color: colors.muted, alignSelf: "center", marginRight: 2 }}>文字装飾</Text>
      {ACTIONS.map((action) => (
        <Pressable key={action.format} accessibilityLabel={action.accessibilityLabel} onPress={() => onFormat(action.format)} style={({ pressed }) => ({ minWidth: 34, height: 30, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? "#E9E7EF" : colors.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 })}>
          <Text style={[{ fontSize: 13, color: colors.foreground }, action.style]}>{action.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function RichTextPreview({ content, groups }: { content: string; groups: MentionGroup[] }) {
  const colors = useColors();
  if (!/(\*\*|__|~~|\[small\]|\[large\])/.test(content)) return null;
  return <View style={{ marginTop: 2, marginBottom: 7, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9 }}>
    <Text style={{ fontSize: 10, fontWeight: "800", color: colors.muted, marginBottom: 4 }}>装飾プレビュー</Text>
    <MentionText content={content} groups={groups} />
  </View>;
}
