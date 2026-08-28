import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { BOARD_THREADS, EVENTS } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { getAllRooms, getMessages } from "@/lib/chat-store";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

export default function AppSearchScreen() {
  const colors = useColors();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!normalized) return [];
    const events = EVENTS.filter((event) => `${event.title} ${event.location} ${(event.genres ?? []).join(" ")}`.toLowerCase().includes(normalized)).map((event) => ({ id: `event:${event.id}`, type: "イベント", title: event.title, detail: `${event.date} ${event.time} ${event.location}`, action: () => router.push({ pathname: "/event-detail", params: { id: event.id } }) }));
    const boards = BOARD_THREADS.filter((thread) => `${thread.title} ${thread.preview}`.toLowerCase().includes(normalized)).map((thread) => ({ id: `board:${thread.id}`, type: "掲示板", title: thread.title || "投稿", detail: thread.preview.slice(0, 80), action: () => router.push({ pathname: "/board", params: { threadId: thread.id } } as any) }));
    const chats = getAllRooms().flatMap((room) => getMessages(room.id).filter((message) => message.content.toLowerCase().includes(normalized)).map((message) => ({ id: `chat:${message.id}`, type: "チャット", title: room.name, detail: message.content.slice(0, 100), action: () => router.push({ pathname: "/chat", params: { id: room.id } }) })));
    return [...events, ...boards, ...chats].slice(0, 80);
  }, [normalized, router]);
  return <ScreenContainer edges={["top", "left", "right"]}><View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}><Pressable onPress={() => router.back()}><IconSymbol name="arrow.left" size={20} color={colors.foreground} /></Pressable><View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, marginLeft: 12, paddingHorizontal: 12 }}><IconSymbol name="magnifyingglass" size={18} color={colors.muted} /><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="イベント・掲示板・チャットを検索" placeholderTextColor={colors.muted} style={{ flex: 1, padding: 12, color: colors.foreground }} /></View></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16 }}>{!normalized ? <Text style={{ textAlign: "center", color: colors.muted, marginTop: 50 }}>キーワードを入力してください</Text> : results.length === 0 ? <Text style={{ textAlign: "center", color: colors.muted, marginTop: 50 }}>該当する情報はありません</Text> : results.map((item) => <Pressable key={item.id} onPress={item.action} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ fontSize: 10, fontWeight: "900", color: "#5865F2" }}>{item.type}</Text><Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, marginTop: 4 }}>{item.title}</Text><Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 4 }}>{item.detail}</Text></Pressable>)}</ScrollView></ScreenContainer>;
}
