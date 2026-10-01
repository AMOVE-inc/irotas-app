import { Modal, Pressable, Text, View } from "react-native";
import { RANK_LABELS } from "../constants/mock-data";
import type { XpReward } from "../lib/xp-store";
import { IconSymbol } from "./ui/icon-symbol";
import { CelebrationConfetti } from "./celebration-confetti";

export function XpRewardPopup({ reward, onClose }: { reward: XpReward | null; onClose: () => void }) {
  if (!reward) return null;
  const levelUp = reward.nextLevel > reward.previousLevel;
  const rankUp = reward.nextRank !== reward.previousRank;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: "rgba(20,18,24,0.48)", alignItems: "center", justifyContent: "center", padding: 28 }}>
      <CelebrationConfetti />
      <View style={{ width: "100%", maxWidth: 360, borderRadius: 24, backgroundColor: "#FFF", padding: 24, alignItems: "center" }}>
        <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: rankUp ? "#FFF3CC" : "#FFF0F6", alignItems: "center", justifyContent: "center" }}><IconSymbol name={rankUp ? "crown.fill" : "ticket.fill"} size={32} color={rankUp ? "#B48316" : "#D56591"} /></View>
        <Text style={{ marginTop: 10, fontSize: 20, fontWeight: "900", color: "#26232A" }}>XPを獲得しました</Text>
        <Text style={{ marginTop: 9, fontSize: 34, fontWeight: "900", color: "#D56591" }}>+{reward.amount} XP</Text>
        <Text style={{ marginTop: 3, fontSize: 13, color: "#77727D" }}>{reward.reason}</Text>
        {levelUp ? <View style={{ marginTop: 16, borderRadius: 14, backgroundColor: "#FFF4F8", paddingHorizontal: 18, paddingVertical: 10 }}><Text style={{ fontSize: 15, fontWeight: "900", color: "#C05B88" }}>レベル {reward.nextLevel} にアップ！</Text></View> : null}
        {rankUp ? <View style={{ marginTop: 9, borderRadius: 14, backgroundColor: "#FFF6D8", paddingHorizontal: 18, paddingVertical: 10 }}><Text style={{ fontSize: 15, fontWeight: "900", color: "#936B08" }}>{RANK_LABELS[reward.nextRank]}にランクアップ！</Text></View> : null}
        {reward.rankPointAward ? <View style={{ width: "100%", marginTop: 9, borderRadius: 14, backgroundColor: "#EEF8F1", paddingHorizontal: 18, paddingVertical: 12 }}><Text style={{ fontSize: 15, fontWeight: "900", color: "#217449" }}>イロタスポイントを {reward.rankPointAward.amount.toLocaleString()}pt 獲得！</Text><Text style={{ marginTop: 3, fontSize: 12, color: "#4E7660" }}>公式イベントの参加費に使えます（残高 {reward.rankPointAward.balance.toLocaleString()}pt）</Text></View> : null}
        <Text style={{ marginTop: 15, fontSize: 12, color: "#77727D" }}>合計 {reward.nextXp.toLocaleString()} XP</Text>
        <Pressable onPress={onClose} style={{ width: "100%", marginTop: 18, borderRadius: 14, backgroundColor: "#26232A", paddingVertical: 14, alignItems: "center" }}><Text style={{ color: "#FFF", fontSize: 15, fontWeight: "900" }}>閉じる</Text></Pressable>
      </View>
    </View>
  </Modal>;
}
