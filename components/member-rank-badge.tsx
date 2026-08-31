import { RANK_COLORS, RANK_LABELS, type MemberRank } from "@/constants/mock-data";
import { Text, View } from "react-native";

const CLUB_LEADER_BADGES = [
  { term: "肉部長", label: "🍖肉部長" },
  { term: "ゴルフ部長", label: "⛳ゴルフ部長" },
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

export function stripRankFromName(name: string) {
  let normalized = name
    .replace(/\s*[【[(（]\s*(?:🥈|🥇|💎)?\s*(?:SILVER|GOLD|PLATINUM|シルバー|ゴールド|プラチナ)(?:会員)?\s*[】\])）]/gi, "")
    .replace(/\s*[【[(（]\s*(?:運営(?:メンバー)?|管理者|admin)\s*[】\])）]/gi, "");
  for (const { term } of CLUB_LEADER_BADGES) {
    normalized = normalized.replace(new RegExp(`(?:[🍖⛳💃🎭🏀🍷✈️🍳🍞🐭🍺]\\s*)?${term}$`, "u"), "");
  }
  return normalized.trim();
}

export function MemberRoleBadge({ name, role, compact = false }: { name?: string; role?: string; compact?: boolean }) {
  const normalized = name ?? "";
  const admin = /IRO\+代表/.test(normalized) || role === "admin";
  const operator = /IRO[+＋]運営|【運営(?:メンバー)?】|運営メンバー/.test(normalized) || role === "operator";
  const leader = clubLeaderBadge(normalized)?.label;
  const paddingHorizontal = compact ? 6 : 9;
  const paddingVertical = compact ? 2 : 3;
  const fontSize = compact ? 8 : 11;
  if (admin || operator) return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal, paddingVertical, backgroundColor: "#D93636" }}><Text style={{ fontSize, fontWeight: "900", color: "#FFF" }}>{admin ? "管理者" : "運営メンバー"}</Text></View>;
  if (leader) return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal, paddingVertical, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D93636" }}><Text style={{ fontSize, fontWeight: "900", color: "#D93636" }}>{leader}</Text></View>;
  return null;
}

export function MemberRankBadge({ rank, compact = false }: { rank: MemberRank; compact?: boolean; name?: string }) {
  if (rank === "regular") return null;
  const platinum = rank === "platinum";
  const color = platinum ? "#D4AF37" : RANK_COLORS[rank];
  return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal: compact ? 5 : 8, paddingVertical: compact ? 2 : 3, backgroundColor: platinum ? "#171717" : `${color}20`, borderWidth: 1, borderColor: color }}><Text style={{ fontSize: compact ? 8 : 11, fontWeight: "900", color }}>{RANK_LABELS[rank]}会員</Text></View>;
}
