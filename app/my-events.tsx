import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, EVENTS, getMemberById, type Event } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import * as Api from "@/lib/_core/api";
import { useAuthContext } from "@/lib/auth-context";
import { getAllEvents } from "@/lib/event-store";
import { getEventParticipationStatus, isEventOrganizer, isPastEventDate } from "@/lib/event-participation";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

function eventTimestamp(event: Event) {
  return Date.parse(`${event.date}T${event.time || "00:00"}:00`);
}

type EventView = "hosted" | "attending" | "applying" | "past" | "coattendees";

const VIEW_OPTIONS: { key: EventView; title: string; description: string }[] = [
  { key: "hosted", title: "自分が幹事", description: "これから幹事を務めるイベント" },
  { key: "attending", title: "参加予定", description: "参加が確定しているイベント" },
  { key: "applying", title: "応募中", description: "参加承認を待っているイベント" },
  { key: "past", title: "過去の幹事／参加", description: "これまで関わったイベント" },
  { key: "coattendees", title: "同席者と同席回数", description: "過去に一緒に参加したメンバー" },
];

export default function MyEventsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuthContext();
  const memberId = user?.memberId ?? CURRENT_USER.id;
  const [events, setEvents] = useState<Event[]>(() => getAllEvents(EVENTS));
  const [selectedView, setSelectedView] = useState<EventView | null>(null);

  useEffect(() => {
    if (!user) return;
    void Api.getEvents().then(setEvents).catch(() => {});
  }, [user]);

  const { eventLists, coAttendees } = useMemo(() => {
    const now = Date.now();
    const past = (event: Event) => event.status === "ended" || isPastEventDate(event, new Date(now));
    const hosted = events.filter((event) => isEventOrganizer(event, memberId));
    const attending = events.filter((event) => getEventParticipationStatus(event, memberId) === "confirmed");
    const applying = events.filter((event) => getEventParticipationStatus(event, memberId) === "applied");
    const sortUpcoming = (items: Event[]) => [...items].sort((a, b) => eventTimestamp(a) - eventTimestamp(b));
    const sortPast = (items: Event[]) => [...items].sort((a, b) => eventTimestamp(b) - eventTimestamp(a));

    const counts = new Map<string, number>();
    attending.filter(past).forEach((event) => {
      [...event.participants, ...(event.companionIds ?? [])].forEach((id) => {
        if (id !== memberId) counts.set(id, (counts.get(id) ?? 0) + 1);
      });
    });

    return {
      eventLists: {
        hosted: sortUpcoming(hosted.filter((event) => !past(event))),
        attending: sortUpcoming(attending.filter((event) => !past(event))),
        applying: sortUpcoming(applying.filter((event) => !past(event))),
        past: sortPast([...new Map([...hosted.filter(past), ...attending.filter(past)].map((event) => [event.id, event])).values()]),
      },
      coAttendees: [...counts.entries()]
        .map(([id, count]) => ({ member: getMemberById(id), id, count }))
        .filter((entry) => entry.member)
        .sort((a, b) => b.count - a.count),
    };
  }, [events, memberId]);

  const selectedOption = VIEW_OPTIONS.find((option) => option.key === selectedView);
  const selectedEvents = selectedView && selectedView !== "coattendees" ? eventLists[selectedView] : [];
  const goBack = () => selectedView ? setSelectedView(null) : router.back();

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Pressable onPress={goBack} hitSlop={12}><IconSymbol name="chevron.left" size={24} color={colors.foreground} /></Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "900", color: colors.foreground }}>{selectedOption?.title ?? "全てのイベント"}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {!selectedView ? (
          <View style={{ gap: 12 }}>
            {VIEW_OPTIONS.map((option) => (
              <Pressable key={option.key} onPress={() => setSelectedView(option.key)} style={{ minHeight: 78, flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flex: 1 }}><Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>{option.title}</Text><Text style={{ marginTop: 4, fontSize: 12, color: colors.muted }}>{option.description}</Text></View>
                <IconSymbol name="chevron.right" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        ) : selectedView !== "coattendees" ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: "hidden" }}>
              {selectedEvents.length ? selectedEvents.map((event, index) => (
                <Pressable key={event.id} onPress={() => router.push({ pathname: "/event-detail", params: { id: event.id } })} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderTopWidth: index ? 0.5 : 0, borderTopColor: colors.border }}>
                  <Image source={event.image} style={{ width: 50, height: 50, borderRadius: 10 }} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: 11 }}><Text numberOfLines={2} style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }}>{event.title}</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>{event.date} {event.time}</Text></View>
                  <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                </Pressable>
              )) : <Text style={{ padding: 14, fontSize: 12, color: colors.muted }}>該当するイベントはありません。</Text>}
          </View>
        ) : (
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: "hidden" }}>
            {coAttendees.length ? coAttendees.map(({ member, id, count }, index) => member && (
              <Pressable key={id} onPress={() => router.push({ pathname: "/member-profile", params: { id } })} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderTopWidth: index ? 0.5 : 0, borderTopColor: colors.border }}>
                <Image source={member.avatar} style={{ width: 42, height: 42, borderRadius: 21 }} contentFit="cover" />
                <Text style={{ flex: 1, marginLeft: 11, fontSize: 14, fontWeight: "800", color: colors.foreground }}>{member.name}</Text>
                <Text style={{ fontSize: 12, fontWeight: "800", color: "#C05B88" }}>{count}回同席</Text>
              </Pressable>
            )) : <Text style={{ padding: 14, fontSize: 12, color: colors.muted }}>過去イベントの同席者情報はありません。</Text>}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
