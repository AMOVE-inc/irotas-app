import { RANK_COLORS, RANK_LABELS, type MemberRank } from "@/constants/mock-data";
import { getMemberStaffRole, shouldShowMemberRank } from "@/lib/member-staff-role";
import { displayMemberName } from "@/lib/display-name";
import { clubLeaderBadge, clubLeaderBadgeForClub, clubLeaderBadgesForRoles, clubLeaderTerms } from "@/lib/club-leader-badges";
import { Text, View } from "react-native";

export { clubLeaderBadgeForClub };

export function MemberClubLeaderBadges({ roles, name, labels: explicitLabels, compact = false }: { roles?: readonly string[] | null; name?: string; labels?: readonly string[] | null; compact?: boolean }) {
  const labels = [...new Set([
    ...clubLeaderBadgesForRoles(roles),
    ...(name ? [clubLeaderBadge(name)?.label].filter((label): label is string => Boolean(label)) : []),
    ...(explicitLabels ?? []).filter(Boolean),
  ])];
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
  normalized = normalized.replace(/(?:🎞️?\s*)?映画[・･]?ドラマ鑑賞部長$/u, "");
  for (const term of clubLeaderTerms()) {
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
