import { useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function CalendarField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date());
  const days = useMemo(() => {
    const year = displayMonth.getFullYear();
    const month = displayMonth.getMonth();
    const offset = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - offset + 1;
      return day >= 1 && day <= count ? new Date(year, month, day) : null;
    });
  }, [displayMonth]);

  return <>
    <Pressable accessibilityLabel={label} onPress={() => { if (/^\d{4}-\d{2}-\d{2}$/.test(value)) setDisplayMonth(new Date(`${value}T00:00:00`)); setVisible(true); }} style={{ height: 46, borderRadius: 10, backgroundColor: colors.surface, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ fontSize: 14, color: value ? colors.foreground : colors.muted }}>{value || "カレンダーから選択"}</Text>
      <IconSymbol name="calendar" size={18} color={colors.muted} />
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <Pressable onPress={() => setVisible(false)} style={{ flex: 1, backgroundColor: "#0007", justifyContent: "center", alignItems: "center", padding: 20 }}>
        <Pressable onPress={(event) => event.stopPropagation?.()} style={{ width: "100%", maxWidth: 370, backgroundColor: colors.surface, borderRadius: 22, padding: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Pressable accessibilityLabel="前の月" onPress={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><IconSymbol name="chevron.left" size={19} color={colors.foreground} /></Pressable>
            <View style={{ alignItems: "center" }}><Text style={{ fontSize: 11, color: colors.muted }}>{label}</Text><Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground }}>{displayMonth.getFullYear()}年 {displayMonth.getMonth() + 1}月</Text></View>
            <Pressable accessibilityLabel="次の月" onPress={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><IconSymbol name="chevron.right" size={19} color={colors.foreground} /></Pressable>
          </View>
          <View style={{ flexDirection: "row", marginBottom: 5 }}>{WEEKDAYS.map((day, index) => <Text key={day} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: "700", color: index === 0 ? "#D97FA8" : index === 6 ? "#6E9EC0" : colors.muted }}>{day}</Text>)}</View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{days.map((date, index) => { const key = date ? dateKey(date) : ""; const selected = key === value; return <View key={`${key}-${index}`} style={{ width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center" }}>{date ? <Pressable accessibilityLabel={`${key}を選択`} onPress={() => { onChange(key); setVisible(false); }} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: selected ? "#5D5C74" : "transparent" }}><Text style={{ fontSize: 14, fontWeight: selected ? "800" : "500", color: selected ? "#FFF" : colors.foreground }}>{date.getDate()}</Text></Pressable> : null}</View>; })}</View>
          <Pressable onPress={() => setVisible(false)} style={{ alignSelf: "flex-end", marginTop: 10, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.background }}><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>閉じる</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}
