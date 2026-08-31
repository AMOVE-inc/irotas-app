import { RANK_COLORS, RANK_LABELS, type MemberRank } from "@/constants/mock-data";
import { Text, View } from "react-native";

export function stripRankFromName(name: string) {
  return name.replace(/\s*[【[(（]\s*(?:🥈|🥇|💎)?\s*(?:SILVER|GOLD|PLATINUM|シルバー|ゴールド|プラチナ)(?:会員)?\s*[】\])）]/gi, "").trim();
}

export function MemberRankBadge({ rank, compact = false, name }: { rank: MemberRank; compact?: boolean; name?: string }) {
  if (name?.includes("IRO+代表")) return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal: compact ? 6 : 9, paddingVertical: compact ? 2 : 3, backgroundColor: "#D93636" }}><Text style={{ fontSize: compact ? 8 : 11, fontWeight: "900", color: "#FFF" }}>代表</Text></View>;
  if (rank === "regular") return null;
  const platinum = rank === "platinum";
  const color = platinum ? "#D4AF37" : RANK_COLORS[rank];
  return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal: compact ? 5 : 8, paddingVertical: compact ? 2 : 3, backgroundColor: platinum ? "#171717" : `${color}20`, borderWidth: 1, borderColor: color }}><Text style={{ fontSize: compact ? 8 : 11, fontWeight: "900", color }}>{RANK_LABELS[rank]}会員</Text></View>;
}
