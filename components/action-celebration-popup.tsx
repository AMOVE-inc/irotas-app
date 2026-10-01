import { Modal, Pressable, Text, View } from "react-native";
import { CelebrationConfetti } from "./celebration-confetti";
import { IconSymbol } from "./ui/icon-symbol";

export function ActionCelebrationPopup({ visible, title, detail, onClose }: { visible: boolean; title: string; detail?: string; onClose: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: "rgba(20,18,24,0.48)", alignItems: "center", justifyContent: "center", padding: 28 }}>
      <CelebrationConfetti />
      <View style={{ width: "100%", maxWidth: 360, borderRadius: 24, backgroundColor: "#FFF", padding: 24, alignItems: "center" }}>
        <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: "#FFF0F6", alignItems: "center", justifyContent: "center" }}><IconSymbol name="checkmark.circle.fill" size={32} color="#D56591" /></View>
        <Text style={{ marginTop: 13, fontSize: 20, fontWeight: "900", color: "#26232A", textAlign: "center" }}>{title}</Text>
        {detail ? <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 20, color: "#77727D", textAlign: "center" }}>{detail}</Text> : null}
        <Pressable onPress={onClose} style={{ width: "100%", marginTop: 20, borderRadius: 14, backgroundColor: "#26232A", paddingVertical: 14, alignItems: "center" }}><Text style={{ color: "#FFF", fontSize: 15, fontWeight: "900" }}>イベント詳細を見る</Text></Pressable>
      </View>
    </View>
  </Modal>;
}
