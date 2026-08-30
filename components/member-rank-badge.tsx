import { RANK_COLORS, RANK_LABELS, type MemberRank } from "@/constants/mock-data";
import { Text, View } from "react-native";

export function stripRankFromName(name: string) {
  return name.replace(/\s*【\s*(?:🥈\s*)?SILVER\s*】/gi, "").replace(/\s*【\s*(?:🥇\s*)?GOLD\s*】/gi, "").replace(/\s*【\s*(?:💎\s*)?PLATINUM\s*】/gi, "").trim();
}

export function MemberRankBadge({ rank, compact = false }: { rank: MemberRank; compact?: boolean }) {
  if (rank === "regular") return null;
  const color = RANK_COLORS[rank];
  return <View style={{ marginLeft: 5, borderRadius: 8, paddingHorizontal: compact ? 5 : 8, paddingVertical: compact ? 2 : 3, backgroundColor: `${color}20`, borderWidth: 1, borderColor: color }}><Text style={{ fontSize: compact ? 8 : 11, fontWeight: "900", color }}>{RANK_LABELS[rank]}会員</Text></View>;
}
