import { RANK_COLORS, RANK_LABELS, type MemberRank } from "@/constants/mock-data";
import { Text, View } from "react-native";

export function stripRankFromName(name: string) {
  return name
    .replace(/\s*[【[(（]\s*(?:🥈|🥇|💎)?\s*(?:SILVER|GOLD|PLATINUM|シルバー|ゴールド|プラチナ)(?:会員)?\s*[】\])）]/gi, "")
    .replace(/\s*[【[(（]\s*(?:運営(?:メンバー)?|管理者|admin)\s*[】\])）]/gi, "")
    .replace(/(?:[🍖⛳💃🎭🏀🍷✈️🍳🍞🐭🍺]\s*)?(?:[ぁ-んァ-ン一-龯A-Za-z]+部長)$/u, "")
    .trim();
}

export function MemberRoleBadge({ name, role, compact = false }: { name?: string; role?: string; compact?: boolean }) {
  const normalized = name ?? "";
  const admin = /IRO\+代表|管理者|\badmin\b/i.test(normalized) || role === "admin";
  const operator = /IRO[+＋]運営|【運営(?:メンバー)?】|運営メンバー/.test(normalized) || role === "operator";
  const leader = normalized.match(/([ぁ-んァ-ン一-龯A-Za-z]+部長)/u)?.[1];
  const paddingHorizontal = compact ? 6 : 9;
  const paddingVertical = compact ? 2 : 3;
  const fontSize = compact ? 8 : 11;
  if (admin || operator) return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal, paddingVertical, backgroundColor: "#D93636" }}><Text style={{ fontSize, fontWeight: "900", color: "#FFF" }}>{admin ? "管理者" : "運営メンバー"}</Text></View>;
  if (leader) return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal, paddingVertical, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D93636" }}><Text style={{ fontSize, fontWeight: "900", color: "#D93636" }}>{leader}</Text></View>;
  return null;
}

export function MemberRankBadge({ rank, compact = false, name }: { rank: MemberRank; compact?: boolean; name?: string }) {
  if (name?.includes("IRO+代表")) return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal: compact ? 6 : 9, paddingVertical: compact ? 2 : 3, backgroundColor: "#D93636" }}><Text style={{ fontSize: compact ? 8 : 11, fontWeight: "900", color: "#FFF" }}>管理者</Text></View>;
  if (rank === "regular") return null;
  const platinum = rank === "platinum";
  const color = platinum ? "#D4AF37" : RANK_COLORS[rank];
  return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal: compact ? 5 : 8, paddingVertical: compact ? 2 : 3, backgroundColor: platinum ? "#171717" : `${color}20`, borderWidth: 1, borderColor: color }}><Text style={{ fontSize: compact ? 8 : 11, fontWeight: "900", color }}>{RANK_LABELS[rank]}会員</Text></View>;
}
