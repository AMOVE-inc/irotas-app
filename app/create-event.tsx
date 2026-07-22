import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, type Event } from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { pendingEvents } from "@/lib/event-store";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`);
const CAPACITY_OPTIONS = Array.from({ length: 100 }, (_, index) => String(index + 1));
const DEFAULT_CANCELLATION_POLICY = "代理が見つかった場合はキャンセル料はかかりません";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function CalendarField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(new Date());
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

  return (
    <>
      <Pressable onPress={() => setVisible(true)} style={{ height: 48, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 15, color: value ? colors.foreground : colors.muted }}>{value || "カレンダーから選択"}</Text>
        <IconSymbol name="calendar" size={19} color={colors.muted} />
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable onPress={() => setVisible(false)} style={{ flex: 1, backgroundColor: "#0007", justifyContent: "center", alignItems: "center", padding: 20 }}>
          <Pressable onPress={(event) => event.stopPropagation?.()} style={{ width: "100%", maxWidth: 370, backgroundColor: colors.surface, borderRadius: 22, padding: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Pressable onPress={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><IconSymbol name="chevron.left" size={19} color={colors.foreground} /></Pressable>
              <View style={{ alignItems: "center" }}><Text style={{ fontSize: 11, color: colors.muted }}>{label}</Text><Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground }}>{displayMonth.getFullYear()}年 {displayMonth.getMonth() + 1}月</Text></View>
              <Pressable onPress={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><IconSymbol name="chevron.right" size={19} color={colors.foreground} /></Pressable>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 5 }}>{WEEKDAYS.map((day, index) => <Text key={day} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: "700", color: index === 0 ? "#D97FA8" : index === 6 ? "#6E9EC0" : colors.muted }}>{day}</Text>)}</View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {days.map((date, index) => {
                const key = date ? dateKey(date) : "";
                const selected = key === value;
                return <View key={`${key}-${index}`} style={{ width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center" }}>{date ? <Pressable onPress={() => { onChange(key); setVisible(false); }} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: selected ? "#5D5C74" : "transparent" }}><Text style={{ fontSize: 14, fontWeight: selected ? "800" : "500", color: selected ? "#FFF" : colors.foreground }}>{date.getDate()}</Text></Pressable> : null}</View>;
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable onPress={() => setVisible(true)} style={{ height: 48, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 15, color: value ? colors.foreground : colors.muted }}>{value || "選択してください"}</Text>
        <IconSymbol name="chevron.down" size={17} color={colors.muted} />
      </Pressable>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>{label}</Text><Pressable onPress={() => setVisible(false)}><IconSymbol name="xmark" size={22} color={colors.muted} /></Pressable></View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>{options.map((option) => <Pressable key={option} onPress={() => { onChange(option); setVisible(false); }} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 15, color: colors.foreground }}>{option}</Text>{value === option ? <IconSymbol name="checkmark" size={18} color="#E8A0BF" /> : null}</Pressable>)}</ScrollView>
        </View>
      </Modal>
    </>
  );
}

function FieldLabel({ children }: { children: string }) {
  const colors = useColors();
  return <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 7, marginTop: 16 }}>{children}</Text>;
}

export default function CreateEventScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const userIsAdmin = authUser?.role === "admin";
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [budget, setBudget] = useState("");
  const [applicationDeadline, setApplicationDeadline] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState(DEFAULT_CANCELLATION_POLICY);
  const [category, setCategory] = useState<"kanto" | "kansai">(authUser?.branch === "kansai" ? "kansai" : "kanto");
  const [eventType, setEventType] = useState<Event["eventType"]>(userIsAdmin ? "official" : "gourmet");

  if (!authUser) {
    return <ScreenContainer edges={["top", "left", "right"]}><View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><IconSymbol name="lock.fill" size={44} color={colors.border} /><Text style={{ fontSize: 16, color: colors.muted, marginTop: 12 }}>メンバーのみイベントを作成できます</Text></View></ScreenContainer>;
  }

  const handleCreate = () => {
    if (!title.trim() || !date || !time || !location.trim() || !capacity || !budget.trim() || !applicationDeadline || !cancellationPolicy.trim()) {
      Alert.alert("入力エラー", "すべての項目を入力してください");
      return;
    }
    if (applicationDeadline > date) {
      Alert.alert("募集期日を確認してください", "募集期日はイベント開催日以前の日付を選択してください");
      return;
    }
    const newEvent: Event = {
      id: `event_${Date.now()}`,
      title: title.trim(),
      description: userIsAdmin && eventType === "official" ? "IRO＋公式イベントです。" : "IRO＋メンバー主催のグルメイベントです。",
      date,
      time,
      location: location.trim(),
      image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400",
      capacity: Number(capacity),
      attendees: 0,
      participants: [],
      price: budget.trim(),
      category,
      eventType: userIsAdmin ? eventType : "gourmet",
      status: "open",
      createdBy: CURRENT_USER.id,
      applicationDeadline,
      cancellationPolicy: cancellationPolicy.trim(),
    };
    pendingEvents.unshift(newEvent);
    Alert.alert("作成完了", `「${newEvent.title}」を作成しました。`, [{ text: "OK", onPress: () => router.back() }]);
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()}><Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text></Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "800", color: colors.foreground }}>イベント作成</Text>
        <Pressable onPress={handleCreate}><Text style={{ fontSize: 16, fontWeight: "800", color: "#E8A0BF" }}>作成</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: "#FFF6FA", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#F3D9E5" }}><Text style={{ fontSize: 14, fontWeight: "800", color: "#B75E87" }}>メンバー主催イベント</Text><Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 4 }}>参加者確定やキャンセル対応まで、幹事として責任を持って運営してください。</Text></View>

        <FieldLabel>店名（イベント名） *</FieldLabel>
        <TextInput value={title} onChangeText={setTitle} placeholder="例：銀座〇〇で寿司会" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border }} />

        <FieldLabel>日時 *</FieldLabel>
        <View style={{ gap: 10 }}><CalendarField label="開催日" value={date} onChange={setDate} /><SelectField label="開始時間" value={time} options={TIME_OPTIONS} onChange={setTime} /></View>

        <FieldLabel>場所 *</FieldLabel>
        <TextInput value={location} onChangeText={setLocation} placeholder="店舗住所や集合場所を入力" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border }} />

        <FieldLabel>募集人数（幹事除く） *</FieldLabel>
        <SelectField label="募集人数" value={capacity} options={CAPACITY_OPTIONS} onChange={setCapacity} />

        <FieldLabel>予算 *</FieldLabel>
        <TextInput value={budget} onChangeText={setBudget} placeholder="例：8,000〜10,000円" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border }} />

        <FieldLabel>募集期日 *</FieldLabel>
        <CalendarField label="募集期日" value={applicationDeadline} onChange={setApplicationDeadline} />

        <FieldLabel>キャンセルポリシー *</FieldLabel>
        <TextInput value={cancellationPolicy} onChangeText={setCancellationPolicy} placeholder={DEFAULT_CANCELLATION_POLICY} placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 96, fontSize: 15, lineHeight: 21, color: colors.foreground, borderWidth: 1, borderColor: colors.border }} />

        <FieldLabel>エリア *</FieldLabel>
        <View style={{ flexDirection: "row", gap: 10 }}>{(["kanto", "kansai"] as const).map((value) => <Pressable key={value} onPress={() => setCategory(value)} style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: category === value ? "#E8A0BF" : colors.surface }}><Text style={{ fontSize: 14, fontWeight: "800", color: category === value ? "#FFF" : colors.foreground }}>{value === "kanto" ? "関東" : "関西"}</Text></Pressable>)}</View>

        {userIsAdmin ? <><FieldLabel>イベント種別 *</FieldLabel><View style={{ flexDirection: "row", gap: 10 }}>{(["official", "gourmet"] as const).map((value) => <Pressable key={value} onPress={() => setEventType(value)} style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: eventType === value ? "#5B9BD5" : colors.surface }}><Text style={{ fontSize: 14, fontWeight: "800", color: eventType === value ? "#FFF" : colors.foreground }}>{value === "official" ? "公式イベント" : "グルメ会"}</Text></Pressable>)}</View></> : null}
      </ScrollView>
    </ScreenContainer>
  );
}
