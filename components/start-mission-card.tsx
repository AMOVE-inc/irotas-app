import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import type { StartMissionKey, StartMissionStatus } from "@/lib/_core/api";
import { visibleStartMissionSteps } from "@/lib/start-mission-visibility";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

const STEP_DETAILS: Record<StartMissionKey, { label: string; description: string }> = {
  profile: { label: "プロフィールを設定する", description: "名前・ユーザーID・生年月日・性別を登録" },
  introduction: { label: "自己紹介を投稿する", description: "メンバーへ自己紹介しよう" },
  event_application: { label: "イベントへ申し込む", description: "気になるイベントへ参加申込" },
  club_membership: { label: "部活へ入部する", description: "好きな部活へ参加" },
  meal_report: { label: "ごちそうさま報告を投稿する", description: "おすすめのお店を共有" },
  event_creation: { label: "イベントを新規作成する", description: "メンバーを誘ってイベントを企画" },
};

export function StartMissionCard({ status }: { status: StartMissionStatus | null }) {
  const colors = useColors();
  const router = useRouter();
  const [showCompleted, setShowCompleted] = useState(false);
  if (!status || status.allCompleted) return null;
  const visibleSteps = visibleStartMissionSteps(status.steps, showCompleted);
  const openStep = (key: StartMissionKey) => {
    if (key === "profile") router.push("/profile-setup");
    else if (key === "introduction") router.push({ pathname: "/board", params: { category: "introduction", view: "threads", compose: "introduction" } });
    else if (key === "event_application") router.push("/(tabs)/events" as any);
    else if (key === "club_membership") router.push("/clubs");
    else if (key === "meal_report") router.push({ pathname: "/board", params: { compose: "meal-report" } });
    else router.push("/create-event");
  };
  return <View style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 12, borderRadius: 18, borderWidth: 1, borderColor: "#F0C5D7", backgroundColor: "#FFF7FA", padding: 15 }}>
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 17, fontWeight: "900", color: colors.foreground }}>IRO+スタートミッション</Text><Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>{status.completedCount}/{status.totalCount} 完了　各項目の初回達成で10XP</Text></View>
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#E8A0BF", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#FFF", fontWeight: "900" }}>{Math.round(status.completedCount / status.totalCount * 100)}%</Text></View>
    </View>
    <View style={{ height: 7, borderRadius: 4, backgroundColor: "#F1DFE7", overflow: "hidden", marginTop: 12 }}><View style={{ width: `${status.completedCount / status.totalCount * 100}%`, height: "100%", backgroundColor: "#D56591" }} /></View>
    <View style={{ marginTop: 10 }}>{visibleSteps.map((step) => { const detail = STEP_DETAILS[step.key]; return <Pressable key={step.key} disabled={step.completed} onPress={() => openStep(step.key)} style={{ minHeight: 55, flexDirection: "row", alignItems: "center", borderTopWidth: 0.5, borderTopColor: "#EEDDE5" }}>
      <IconSymbol name={step.completed ? "checkmark.circle.fill" : "circle"} size={21} color={step.completed ? "#34A853" : "#D56591"} />
      <View style={{ flex: 1, marginLeft: 10 }}><Text style={{ fontSize: 14, fontWeight: "800", color: step.completed ? colors.muted : colors.foreground, textDecorationLine: step.completed ? "line-through" : "none" }}>{detail.label}</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{step.completed ? "完了" : detail.description}</Text></View>
      {!step.completed ? <IconSymbol name="chevron.right" size={16} color={colors.muted} /> : null}
    </Pressable>; })}</View>
    {status.completedCount > 0 ? <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: showCompleted }}
      onPress={() => setShowCompleted((current) => !current)}
      style={{ alignSelf: "flex-start", minHeight: 40, justifyContent: "center", marginTop: 4, paddingHorizontal: 2 }}
    >
      <Text style={{ color: "#9A6178", fontSize: 13, fontWeight: "800" }}>
        {showCompleted ? "完了済みを隠す" : `完了済みを表示（${status.completedCount}）`}
      </Text>
    </Pressable> : null}
  </View>;
}
