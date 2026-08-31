import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { subscribeApiLoading } from "@/lib/api-loading";

export function GlobalLoadingOverlay() {
  const [visible, setVisible] = useState(false);
  useEffect(() => subscribeApiLoading(setVisible), []);
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(20,18,24,0.28)" }}>
      <View style={{ minWidth: 132, borderRadius: 20, paddingVertical: 22, paddingHorizontal: 26, alignItems: "center", backgroundColor: "rgba(255,255,255,0.96)" }}>
        <ActivityIndicator size="large" color="#D65E8D" />
        <Text style={{ marginTop: 12, fontSize: 14, fontWeight: "800", color: "#252229" }}>処理中…</Text>
      </View>
    </View>
  </Modal>;
}
