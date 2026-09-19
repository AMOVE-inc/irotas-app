import { Image } from "expo-image";
import { Linking, Pressable, ScrollView, Text, View, type TextStyle } from "react-native";
import { BOARD_THREADS, type Member , BoardThread, ChatRoom } from "@/constants/mock-data";
import type { MentionGroup } from "@/lib/mentions";
import { extractMentionLabels, isGroupMention, selectedEventMentionLabels } from "@/lib/mentions";
import { useColors } from "@/hooks/use-colors";
import { formatEventLinkLabel, parseInternalLink, type InternalLinkMention, type InternalLinkPathname } from "@/lib/internal-links";
import { getAllRooms } from "@/lib/chat-store";
import { useRouter } from "expo-router";
import { parseDiscordRichLines, tokenizeRichTextLinks, type DiscordTextFormat } from "@/lib/discord-rich-text";
import * as Api from "@/lib/_core/api";
import { useEffect, useState } from "react";
import { stripRankFromName } from "@/components/member-rank-badge";

const DISCORD_FORMAT_STYLES: Record<DiscordTextFormat, TextStyle> = {
  boldItalic: { fontWeight: "900", fontStyle: "italic" },
  boldHeading: { fontSize: 18, lineHeight: 25, fontWeight: "900" },
  bold: { fontWeight: "900" },
  underline: { textDecorationLine: "underline" },
  strikethrough: { textDecorationLine: "line-through" },
  small: { fontSize: 16, lineHeight: 23 },
  large: { fontSize: 18, lineHeight: 25 },
  italic: { fontStyle: "italic" },
};

/** Mentions should show just a member name, never their rank or club-leader title. */
export function mentionDisplayName(label: string) {
  return stripRankFromName(label.replace(/^@/, "").replace(/[、。！？!?.,，．]+$/g, ""));
}

/** Imported Discord mentions occasionally put a space before the leader/rank suffix. */
function normalizeRenderedMentions(content: string) {
  return content
    .replace(/@([^\r\n@]{1,80}?)（(?:IRO\d+|member-[^)）]+|discord-[^)）]+)）/giu, "@$1")
    .replace(/(@[^\s@]+)(?:\s*(?:[🍖⛳🏃🚶⚾💃🎭🏀🍷✈️🍳🍞🐭🍺]\s*)?[^\s【】]{1,20}部長)?(?:\s*[【[(（]\s*(?:🥈|🥇|💎)?\s*(?:SILVER|GOLD|PLATINUM|シルバー|ゴールド|プラチナ)(?:会員)?\s*[】\])）])?/giu, (_whole, mention: string) => `@${mentionDisplayName(mention)}`);
}

function InternalLinkLabel({ link }: { link: InternalLinkMention }) {
  const [label, setLabel] = useState(link.label);
  useEffect(() => {
    setLabel(link.label);
    if (link.label !== "📅 イベント" && link.label !== "#スレッド" && link.label !== "#チャット") return;
    let active = true;
    const request = link.pathname === "/event-detail" && link.params.id
      ? Api.getEvent(link.params.id).then(formatEventLinkLabel)
      : link.pathname === "/board" && link.params.thread
      ? Api.getSharedBoardThreadTitle(link.params.thread).then((result) => `#${result.title}`)
      : link.pathname === "/chat" && link.params.id
        ? Api.getSharedChatRoom(link.params.id).then((room) => `#${room.name}`)
        : Promise.resolve(link.label);
    void request.then((resolved) => { if (active) setLabel(resolved); }).catch(() => {});
    return () => { active = false; };
  }, [link.label, link.pathname, link.params.thread, link.params.id]);
  return <Text>{label}</Text>;
}

export function MentionText({ content, outgoing = false, groups, rooms = getAllRooms(), threads = BOARD_THREADS, onOpenInternalLink, onMentionPress, onClubMentionPress }: { content: string; outgoing?: boolean; groups: MentionGroup[]; rooms?: ChatRoom[]; threads?: BoardThread[]; onOpenInternalLink?: (pathname: InternalLinkPathname, params: Record<string, string>) => void; onMentionPress?: (label: string) => void; onClubMentionPress?: (group: MentionGroup) => void }) {
  const colors = useColors();
  const router = useRouter();
  const openInternalLink = onOpenInternalLink ?? ((pathname: InternalLinkPathname, params: Record<string, string>) => router.push({ pathname, params } as any));
  const renderMentions = (value: string, keyPrefix: string) => value.split(/(@[^\s@]+)/g).map((part, index) => {
    if (!part.startsWith("@")) return <Text key={`${keyPrefix}-${index}`}>{part}</Text>;
    const [rawLabel] = extractMentionLabels(part);
    const label = rawLabel ? mentionDisplayName(rawLabel) : undefined;
    const group = label ? groups.find((item) => item.label === label) : undefined;
    const grouped = Boolean(group && isGroupMention(label!, groups));
    const onPress = group?.category === "club" && onClubMentionPress
      ? () => onClubMentionPress(group)
      : !grouped && label && onMentionPress
        ? () => onMentionPress(label)
        : undefined;
    return <Text key={`${keyPrefix}-${index}`} accessibilityRole={onPress ? "link" : undefined} onPress={onPress} style={{ fontWeight: "800", color: grouped ? (outgoing ? "#FFF3B0" : "#9A6A12") : (outgoing ? "#FFE0F0" : "#C05B88"), backgroundColor: grouped ? (outgoing ? "rgba(255,210,70,0.22)" : "#FFF2C7") : "transparent", textDecorationLine: onPress ? "underline" : "none" }}>{grouped ? part : `@${label ?? rawLabel ?? ""}`}</Text>;
  });

  const renderPlain = (value: string, keyPrefix: string) => tokenizeRichTextLinks(value).map((token, index) => {
    if (token.type === "text") return <Text key={`${keyPrefix}-${index}`}>{renderMentions(token.value, `${keyPrefix}-${index}-mention`)}</Text>;
    const internal = parseInternalLink(token.url, rooms, threads);
    if (internal) return <Text key={`${keyPrefix}-${index}`}><Text accessibilityRole="link" onPress={() => openInternalLink(internal.pathname, internal.params)} style={{ fontWeight: "800", color: outgoing ? "#164F91" : "#2065B7", textDecorationLine: "underline" }}><InternalLinkLabel link={internal} /></Text>{token.suffix}</Text>;
    return <Text key={`${keyPrefix}-${index}`}><Text accessibilityRole="link" onPress={() => void Linking.openURL(token.url)} style={{ color: outgoing ? "#DCEBFF" : "#3478C7", textDecorationLine: "underline", fontWeight: "700" }}>{token.label}</Text>{token.suffix}</Text>;
  });

  return (
    <Text style={{ fontSize: 14, lineHeight: 20, color: outgoing ? "#FFF" : colors.foreground }}>
      {parseDiscordRichLines(normalizeRenderedMentions(content)).map((heading, index, lines) => {
        const headingStyle: TextStyle = heading.level === 1
          ? { fontSize: 22, lineHeight: 30, fontWeight: "900" }
          : heading.level > 1
            ? { fontSize: 17, lineHeight: 25, fontWeight: "900" }
            : {};
        return <Text key={`line-${index}`} style={headingStyle}>{heading.segments.map((segment, segmentIndex) => <Text key={`segment-${segmentIndex}`} style={Object.assign({}, ...segment.formats.map((format) => DISCORD_FORMAT_STYLES[format]))}>{renderPlain(segment.text, `line-${index}-segment-${segmentIndex}`)}</Text>)}{index < lines.length - 1 ? "\n" : ""}</Text>;
      })}
    </Text>
  );
}

export function MentionSuggestions({ query, groups, members, memberIds, onSelect }: { query: string; groups: MentionGroup[]; members: Member[]; memberIds?: readonly string[]; onSelect: (label: string, memberId?: string) => void }) {
  const colors = useColors();
  const [directory, setDirectory] = useState<Api.PublicMember[] | null>(null);
  useEffect(() => {
    let active = true;
    void Api.getMemberDirectory().then((items) => { if (active) setDirectory(items); }).catch(() => { if (active) setDirectory([]); });
    return () => { active = false; };
  }, []);
  const normalized = query.toLowerCase();
  const filteredGroups = groups.filter((group) => !query || group.label.toLowerCase().includes(normalized) || group.description.includes(query));
  const allowedMemberIds = memberIds ? new Set(memberIds) : null;
  const candidates = directory?.length ? directory : members.map((member) => ({ id: member.id, displayName: member.name, profile: {} as Api.PublicMember["profile"], memberTerm: member.generation ? String(member.generation) : null })) as Api.PublicMember[];
  const filteredMembers = candidates
    .filter((member) => !allowedMemberIds || allowedMemberIds.has(member.id))
    .filter((member) => !query || member.displayName.toLowerCase().includes(normalized) || member.id.toLowerCase().includes(normalized))
    .slice(0, 8);
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
        {filteredMembers.map((member) => {
          const avatarUrl = typeof member.profile.avatarUrl === "string" ? member.profile.avatarUrl : undefined;
          return (
          <Pressable key={member.id} onPress={() => onSelect(mentionDisplayName(member.displayName), member.id)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: pressed ? colors.surface : colors.background })}>
            <Image source={avatarUrl ? { uri: avatarUrl } : require("@/assets/images/irotas-logo-square.png")} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 10 }} contentFit="cover" />
            <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>@{mentionDisplayName(member.displayName)}</Text><Text style={{ fontSize: 11, color: colors.muted }}>{member.id}{member.memberTerm ? `・${formatMemberTerm(member.memberTerm)}` : ""}</Text></View>
          </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function EventMentionPreview({ content, groups }: { content: string; groups: MentionGroup[] }) {
  const colors = useColors();
  const labels = selectedEventMentionLabels(content, groups);
  if (!labels.length) return null;
  return <View accessibilityLabel={`メンション先: ${labels.join("、")}`} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8 }}>
    <Text style={{ fontSize: 12, color: colors.muted }}>メンション先</Text>
    {labels.map((label) => <Text key={label} style={{ fontSize: 12, fontWeight: "800", color: "#9A4A75", backgroundColor: "#FBE7F0", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 }}>{label}</Text>)}
  </View>;
}
function formatMemberTerm(memberTerm: string): string {
  const termNumber = memberTerm.match(/\d+/)?.[0];
  return termNumber ? `第${termNumber}期生` : memberTerm;
}
