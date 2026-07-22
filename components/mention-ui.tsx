import { Image } from "expo-image";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Member } from "@/constants/mock-data";
import type { MentionGroup } from "@/lib/mentions";
import { extractMentionLabels, isGroupMention } from "@/lib/mentions";
import { useColors } from "@/hooks/use-colors";

export function MentionText({ content, outgoing = false, groups }: { content: string; outgoing?: boolean; groups: MentionGroup[] }) {
  const colors = useColors();
  const parts = content.split(/(@[^\s@]+)/g);
  return (
    <Text style={{ fontSize: 14, lineHeight: 20, color: outgoing ? "#FFF" : colors.foreground }}>
      {parts.map((part, index) => {
        if (!part.startsWith("@")) return <Text key={index}>{part}</Text>;
        const [label] = extractMentionLabels(part);
        const grouped = Boolean(label && isGroupMention(label, groups));
        return <Text key={index} style={{ fontWeight: "800", color: grouped ? (outgoing ? "#FFF3B0" : "#9A6A12") : (outgoing ? "#FFE0F0" : "#C05B88"), backgroundColor: grouped ? (outgoing ? "rgba(255,210,70,0.22)" : "#FFF2C7") : "transparent" }}>{part}</Text>;
      })}
    </Text>
  );
}

export function MentionSuggestions({ query, groups, members, onSelect }: { query: string; groups: MentionGroup[]; members: Member[]; onSelect: (label: string) => void }) {
  const colors = useColors();
  const normalized = query.toLowerCase();
  const filteredGroups = groups.filter((group) => !query || group.label.toLowerCase().includes(normalized) || group.description.includes(query));
  const filteredMembers = members.filter((member) => !query || member.name.toLowerCase().includes(normalized) || member.id.toLowerCase().includes(normalized)).slice(0, 8);
  if (!filteredGroups.length && !filteredMembers.length) return null;

  return (
    <View style={{ maxHeight: 290, backgroundColor: colors.background, borderTopWidth: 1, borderColor: colors.border }}>
      <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {filteredGroups.map((group) => (
          <Pressable key={group.id} onPress={() => onSelect(group.label)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: pressed ? colors.surface : colors.background })}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#5B5A73", alignItems: "center", justifyContent: "center", marginRight: 10 }}><Text style={{ fontSize: 15, fontWeight: "900", color: "#FFF" }}>@</Text></View>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: "800", color: "#5B5A73" }}>@{group.label}</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{group.description}</Text></View>
            <Text style={{ fontSize: 11, color: colors.muted }}>{group.memberIds.length}人</Text>
          </Pressable>
        ))}
        {filteredMembers.map((member) => (
          <Pressable key={member.id} onPress={() => onSelect(member.name)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: pressed ? colors.surface : colors.background })}>
            <Image source={member.avatar} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 10 }} contentFit="cover" />
            <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>@{member.name}</Text><Text style={{ fontSize: 11, color: colors.muted }}>{member.id}・第{member.generation}期</Text></View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
