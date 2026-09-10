import { RANK_COLORS, RANK_LABELS, type MemberRank } from "@/constants/mock-data";
import { getMemberStaffRole, shouldShowMemberRank } from "@/lib/member-staff-role";
import { displayMemberName } from "@/lib/display-name";
import { Text, View } from "react-native";

const CLUB_LEADER_BADGES = [
  { term: "肉部長", label: "🍖肉部長" },
  { term: "ゴルフ部長", label: "⛳ゴルフ部長" },
  { term: "ランニング部長", label: "🏃ランニング部長" },
  { term: "散歩部長", label: "🚶散歩部長" },
  { term: "スポーツ観戦部長", label: "⚾スポーツ観戦部長" },
  { term: "旅行部長", label: "✈️旅行部長" },
  { term: "スイーツ部長", label: "🍰スイーツ部長" },
  { term: "スポーツ部長", label: "🏀スポーツ部長" },
  { term: "ディズニー部長", label: "🐭ディズニー部長" },
  { term: "舞台鑑賞部長", label: "🎭舞台鑑賞部長" },
  { term: "料理教室部長", label: "🍳料理教室部長" },
  { term: "ワイン部長", label: "🍷ワイン部長" },
  { term: "パン部長", label: "🍞パン部長" },
  { term: "昼飲み部長", label: "🍺昼飲み部長" },
];

function clubLeaderBadge(name: string) {
  return CLUB_LEADER_BADGES.find(({ term }) => name.includes(term));
}

/** Club names come from the server, while imported display names may not include a leader suffix. */
export function clubLeaderBadgeForClub(clubName: string) {
  const normalized = clubName.replace(/部$/, "");
  return CLUB_LEADER_BADGES.find(({ term }) => term.replace(/部長$/, "") === normalized)?.label
    ?? `${clubName}長`;
}

/** Return every club-leader label represented by imported Discord roles. */
export function clubLeaderBadgesForRoles(roles?: readonly string[] | null) {
  if (!roles?.length) return [];
  return CLUB_LEADER_BADGES
    .filter(({ term }) => roles.some((role) => role.includes(term)))
    .map(({ label }) => label);
}

export function MemberClubLeaderBadges({ roles, name, compact = false }: { roles?: readonly string[] | null; name?: string; compact?: boolean }) {
  const labels = [...new Set([...clubLeaderBadgesForRoles(roles), ...(name ? [clubLeaderBadge(name)?.label].filter((label): label is string => Boolean(label)) : [])])];
  if (!labels.length) return null;
  const paddingHorizontal = compact ? 6 : 9;
  const fontSize = compact ? 8 : 11;
  const badgeHeight = compact ? 19 : 24;
  return <>
    {labels.map((label) => (
      <View key={label} style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal, height: badgeHeight, justifyContent: "center", backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D93636" }}>
        <Text style={{ fontSize, fontWeight: "900", color: "#D93636" }}>{label}</Text>
      </View>
    ))}
  </>;
}

export function stripRankFromName(name: string) {
  let normalized = name
    .replace(/\s*[【[(（]\s*(?:🥈|🥇|💎)?\s*(?:SILVER|GOLD|PLATINUM|シルバー|ゴールド|プラチナ)(?:会員)?\s*[】\])）]/gi, "")
    .replace(/\s*[【[(（]\s*(?:運営(?:メンバー)?|管理者|admin)\s*[】\])）]/gi, "");
  for (const { term } of CLUB_LEADER_BADGES) {
    normalized = normalized.replace(new RegExp(`(?:[🍖⛳🏃🚶⚾💃🎭🏀🍷✈️🍳🍞🐭🍺]\\s*)?${term}$`, "u"), "");
  }
  return displayMemberName(normalized);
}

export function MemberRoleBadge({ name, role, compact = false, leaderLabel }: { name?: string; role?: string; compact?: boolean; leaderLabel?: string | null }) {
  const normalized = name ?? "";
  const staffRole = getMemberStaffRole(normalized, role);
  const admin = staffRole === "admin";
  const operator = staffRole === "operator";
  const leader = leaderLabel ?? clubLeaderBadge(normalized)?.label;
  const paddingHorizontal = compact ? 6 : 9;
  const fontSize = compact ? 8 : 11;
  const badgeHeight = compact ? 19 : 24;
  if (admin || operator) return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal, height: badgeHeight, justifyContent: "center", backgroundColor: "#D93636" }}><Text style={{ fontSize, fontWeight: "900", color: "#FFF" }}>{admin ? "管理者" : "運営メンバー"}</Text></View>;
  if (leader) return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal, height: badgeHeight, justifyContent: "center", backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D93636" }}><Text style={{ fontSize, fontWeight: "900", color: "#D93636" }}>{leader}</Text></View>;
  return null;
}

export function MemberRankBadge({ rank, compact = false, name, role }: { rank: MemberRank; compact?: boolean; name?: string; role?: string }) {
  if (!shouldShowMemberRank(rank, name, role)) return null;
  const platinum = rank === "platinum";
  const color = platinum ? "#D4AF37" : RANK_COLORS[rank];
  const badgeHeight = compact ? 19 : 24;
  return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal: compact ? 5 : 8, height: badgeHeight, justifyContent: "center", backgroundColor: platinum ? "#171717" : `${color}20`, borderWidth: 1, borderColor: color }}><Text style={{ fontSize: compact ? 8 : 11, fontWeight: "900", color }}>{RANK_LABELS[rank]}会員</Text></View>;
}
