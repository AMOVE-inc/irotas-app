import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, EVENTS, type Event } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { loadEventFeedback, saveEventFeedback } from "@/lib/ai-data-store";
import * as Api from "@/lib/_core/api";
import { getAllEvents } from "@/lib/event-store";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

function Stars({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <View style={{ flexDirection: "row", gap: 7 }}>{[1, 2, 3, 4, 5].map((star) => <Pressable key={star} onPress={() => onChange(star)}><IconSymbol name="star.fill" size={26} color={star <= value ? "#F5A623" : "#D8D8DC"} /></Pressable>)}</View>;
}

export default function EventFeedbackScreen() {
  const colors = useColors(); const router = useRouter(); const { id } = useLocalSearchParams<{ id: string }>(); const [event, setEvent] = useState<Event | undefined>(() => getAllEvents(EVENTS).find((item) => item.id === id));
  const [overall, setOverall] = useState(0); const [food, setFood] = useState(0); const [venue, setVenue] = useState(0); const [community, setCommunity] = useState(0); const [comment, setComment] = useState("");
  useEffect(() => { if (!id) return; void loadEventFeedback(CURRENT_USER.id, id).then((value) => { if (!value) return; setOverall(value.overallRating); setFood(value.foodRating); setVenue(value.venueRating); setCommunity(value.communityRating); setComment(value.comment); }); }, [id]);
  useEffect(() => { if (!id) return; void Api.getEvent(id).then(setEvent).catch(() => {}); }, [id]);
  const submit = async () => { if (!event || !id || !overall) return Alert.alert("総合評価を選択してください"); const payload = { eventId: id, userId: CURRENT_USER.id, overallRating: overall, foodRating: food || overall, venueRating: venue || overall, communityRating: community || overall, wouldAttendAgain: true, goodTags: [], improvementTags: [], comment: comment.trim(), submittedAt: new Date().toISOString() }; try { await Api.saveEventFeedback(payload); } catch { await saveEventFeedback(payload); } Alert.alert("ありがとうございました", "イベント改善のために安全に保管しました。", [{ text: "OK", onPress: () => router.back() }]); };
  if (!event) return <ScreenContainer><Text>イベントが見つかりません</Text></ScreenContainer>;
  return <ScreenContainer><View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Pressable onPress={() => router.back()}><IconSymbol name="xmark" size={24} color={colors.foreground} /></Pressable><Text style={{ flex: 1, fontSize: 19, fontWeight: "900", color: colors.foreground, marginLeft: 10 }}>イベント参加後アンケート</Text></View><ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}><Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground }}>{event.title}</Text><Text style={{ fontSize: 12, color: colors.muted, marginTop: 5, marginBottom: 18 }}>回答はイベント改善にのみ利用します。</Text>{[{ label: "総合評価（必須）", value: overall, set: setOverall }, { label: "料理・ドリンク", value: food, set: setFood }, { label: "お店・会場", value: venue, set: setVenue }, { label: "交流のしやすさ", value: community, set: setCommunity }].map((row) => <View key={row.label} style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10 }}><Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, marginBottom: 9 }}>{row.label}</Text><Stars value={row.value} onChange={row.set} /></View>)}<Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground, marginTop: 10, marginBottom: 8 }}>自由コメント</Text><TextInput value={comment} onChangeText={setComment} placeholder="良かった点や改善してほしい点を自由に記載してください（任意）" placeholderTextColor={colors.muted} multiline style={{ minHeight: 130, backgroundColor: colors.surface, borderRadius: 14, padding: 14, color: colors.foreground }} /></ScrollView><View style={{ position: "absolute", left: 16, right: 16, bottom: 24 }}><Pressable onPress={() => void submit()} style={{ minHeight: 54, borderRadius: 15, backgroundColor: "#D65E8D", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#FFF", fontSize: 16, fontWeight: "900" }}>評価を送信</Text></Pressable></View></ScreenContainer>;
}
