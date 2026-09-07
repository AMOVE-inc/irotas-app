import { Image } from "expo-image";
import { Linking, Pressable, ScrollView, Text, View, type TextStyle } from "react-native";
import { BOARD_THREADS, type Member , BoardThread, ChatRoom } from "@/constants/mock-data";
import type { MentionGroup } from "@/lib/mentions";
import { extractMentionLabels, isGroupMention } from "@/lib/mentions";
import { useColors } from "@/hooks/use-colors";
import { parseInternalLink } from "@/lib/internal-links";
import { getAllRooms } from "@/lib/chat-store";
import { useRouter } from "expo-router";
import { parseDiscordHeading, tokenizeRichTextLinks } from "@/lib/discord-rich-text";

export function MentionText({ content, outgoing = false, groups, rooms = getAllRooms(), threads = BOARD_THREADS, onOpenInternalLink, onMentionPress, onClubMentionPress }: { content: string; outgoing?: boolean; groups: MentionGroup[]; rooms?: ChatRoom[]; threads?: BoardThread[]; onOpenInternalLink?: (pathname: "/chat" | "/board", params: Record<string, string>) => void; onMentionPress?: (label: string) => void; onClubMentionPress?: (group: MentionGroup) => void }) {
  const colors = useColors();
  const router = useRouter();
  const openInternalLink = onOpenInternalLink ?? ((pathname: "/chat" | "/board", params: Record<string, string>) => router.push({ pathname, params } as any));
  const renderMentions = (value: string, keyPrefix: string) => value.split(/(@[^\s@]+)/g).map((part, index) => {
    if (!part.startsWith("@")) return <Text key={`${keyPrefix}-${index}`}>{part}</Text>;
    const [label] = extractMentionLabels(part);
    const group = label ? groups.find((item) => item.label === label) : undefined;
    const grouped = Boolean(group && isGroupMention(label!, groups));
    const onPress = group?.category === "club" && onClubMentionPress
      ? () => onClubMentionPress(group)
      : !grouped && label && onMentionPress
        ? () => onMentionPress(label)
        : undefined;
    return <Text key={`${keyPrefix}-${index}`} accessibilityRole={onPress ? "link" : undefined} onPress={onPress} style={{ fontWeight: "800", color: grouped ? (outgoing ? "#FFF3B0" : "#9A6A12") : (outgoing ? "#FFE0F0" : "#C05B88"), backgroundColor: grouped ? (outgoing ? "rgba(255,210,70,0.22)" : "#FFF2C7") : "transparent", textDecorationLine: onPress ? "underline" : "none" }}>{part}</Text>;
  });

  const renderPlain = (value: string, keyPrefix: string) => tokenizeRichTextLinks(value).map((token, index) => {
    if (token.type === "text") return <Text key={`${keyPrefix}-${index}`}>{renderMentions(token.value, `${keyPrefix}-${index}-mention`)}</Text>;
    const internal = parseInternalLink(token.url, rooms, threads);
    if (internal) return <Text key={`${keyPrefix}-${index}`}><Text accessibilityRole="link" onPress={() => openInternalLink(internal.pathname, internal.params)} style={{ fontWeight: "900", color: outgoing ? "#FFF3B0" : "#5B5A73", backgroundColor: outgoing ? "rgba(255,210,70,0.22)" : "#EEEAF7" }}>{token.label === token.url ? internal.label : token.label}</Text>{token.suffix}</Text>;
    return <Text key={`${keyPrefix}-${index}`}><Text accessibilityRole="link" onPress={() => void Linking.openURL(token.url)} style={{ color: outgoing ? "#DCEBFF" : "#3478C7", textDecorationLine: "underline", fontWeight: "700" }}>{token.label}</Text>{token.suffix}</Text>;
  });

  const renderRich = (value: string, keyPrefix: string): React.ReactNode => {
    const pattern = /(\*\*# ([\s\S]+?)\*\*|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\[small\]([\s\S]+?)\[\/small\]|\[large\]([\s\S]+?)\[\/large\])/;
    const match = pattern.exec(value);
    if (!match || match.index === undefined) return renderPlain(value, keyPrefix);
    const before = value.slice(0, match.index);
    const after = value.slice(match.index + match[0].length);
    let inner = "";
    let style: TextStyle = {};
    if (match[2] !== undefined) { inner = match[2]; style = { fontSize: 18, lineHeight: 25, fontWeight: "900" }; }
    else if (match[3] !== undefined) { inner = match[3]; style = { fontWeight: "900" }; }
    else if (match[4] !== undefined) { inner = match[4]; style = { textDecorationLine: "underline" }; }
    else if (match[5] !== undefined) { inner = match[5]; style = { textDecorationLine: "line-through" }; }
    else if (match[6] !== undefined) { inner = match[6]; style = { fontSize: 16, lineHeight: 23 }; }
    else { inner = match[7]; style = { fontSize: 18, lineHeight: 25 }; }
    return <>{renderRich(before, `${keyPrefix}-before`)}<Text key={`${keyPrefix}-formatted`} style={style}>{renderRich(inner, `${keyPrefix}-inner`)}</Text>{renderRich(after, `${keyPrefix}-after`)}</>;
  };
  return (
    <Text style={{ fontSize: 14, lineHeight: 20, color: outgoing ? "#FFF" : colors.foreground }}>
      {content.split("\n").map((line, index, lines) => {
        const heading = parseDiscordHeading(line);
        const headingStyle: TextStyle = heading.level === 1
          ? { fontSize: 22, lineHeight: 30, fontWeight: "900" }
          : heading.level > 1
            ? { fontSize: 17, lineHeight: 25, fontWeight: "900" }
            : {};
        return <Text key={`line-${index}`} style={headingStyle}>{renderRich(heading.content, `line-${index}`)}{index < lines.length - 1 ? "\n" : ""}</Text>;
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
