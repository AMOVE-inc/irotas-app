import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, EVENTS, getMemberById, type Event } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import * as Api from "@/lib/_core/api";
import { useAuthContext } from "@/lib/auth-context";
import { getAllEvents } from "@/lib/event-store";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

function eventTimestamp(event: Event) {
  return Date.parse(`${event.date}T${event.time || "00:00"}:00`);
}

export default function MyEventsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuthContext();
  const memberId = user?.memberId ?? CURRENT_USER.id;
  const [events, setEvents] = useState<Event[]>(() => getAllEvents(EVENTS));

  useEffect(() => {
    if (!user) return;
    void Api.getEvents().then(setEvents).catch(() => {});
  }, [user]);

  const { sections, coAttendees } = useMemo(() => {
    const now = Date.now();
    const past = (event: Event) => event.status === "ended" || eventTimestamp(event) < now;
    const hosted = events.filter((event) => event.createdBy === memberId);
    const attending = events.filter((event) => event.participants.includes(memberId) || event.companionIds?.includes(memberId));
    const applying = events.filter((event) => event.applicantIds?.includes(memberId) && !event.participants.includes(memberId));
    const sortUpcoming = (items: Event[]) => [...items].sort((a, b) => eventTimestamp(a) - eventTimestamp(b));
    const sortPast = (items: Event[]) => [...items].sort((a, b) => eventTimestamp(b) - eventTimestamp(a));

    const counts = new Map<string, number>();
    attending.filter(past).forEach((event) => {
      [...event.participants, ...(event.companionIds ?? [])].forEach((id) => {
        if (id !== memberId) counts.set(id, (counts.get(id) ?? 0) + 1);
      });
    });

    return {
      sections: [
        { title: "幹事のイベント", items: sortUpcoming(hosted.filter((event) => !past(event))) },
        { title: "参加予定のイベント", items: sortUpcoming(attending.filter((event) => !past(event))) },
        { title: "応募中のイベント", items: sortUpcoming(applying.filter((event) => !past(event))) },
        { title: "過去に幹事をしたイベント", items: sortPast(hosted.filter(past)) },
        { title: "過去に参加したイベント", items: sortPast(attending.filter(past)) },
      ],
      coAttendees: [...counts.entries()]
        .map(([id, count]) => ({ member: getMemberById(id), id, count }))
        .filter((entry) => entry.member)
        .sort((a, b) => b.count - a.count),
    };
  }, [events, memberId]);

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} hitSlop={12}><IconSymbol name="chevron.left" size={24} color={colors.foreground} /></Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "900", color: colors.foreground }}>全てのイベント</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {sections.map((section) => (
          <View key={section.title} style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground, marginBottom: 8 }}>{section.title}</Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: "hidden" }}>
              {section.items.length ? section.items.map((event, index) => (
                <Pressable key={event.id} onPress={() => router.push({ pathname: "/event-detail", params: { id: event.id } })} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderTopWidth: index ? 0.5 : 0, borderTopColor: colors.border }}>
                  <Image source={event.image} style={{ width: 50, height: 50, borderRadius: 10 }} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: 11 }}><Text numberOfLines={2} style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }}>{event.title}</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>{event.date} {event.time}</Text></View>
                  <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                </Pressable>
              )) : <Text style={{ padding: 14, fontSize: 12, color: colors.muted }}>該当するイベントはありません。</Text>}
            </View>
          </View>
        ))}

        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground, marginBottom: 8 }}>同席者一覧</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: "hidden" }}>
            {coAttendees.length ? coAttendees.map(({ member, id, count }, index) => member && (
              <Pressable key={id} onPress={() => router.push({ pathname: "/member-profile", params: { id } })} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderTopWidth: index ? 0.5 : 0, borderTopColor: colors.border }}>
                <Image source={member.avatar} style={{ width: 42, height: 42, borderRadius: 21 }} contentFit="cover" />
                <Text style={{ flex: 1, marginLeft: 11, fontSize: 14, fontWeight: "800", color: colors.foreground }}>{member.name}</Text>
                <Text style={{ fontSize: 12, fontWeight: "800", color: "#C05B88" }}>{count}回同席</Text>
              </Pressable>
            )) : <Text style={{ padding: 14, fontSize: 12, color: colors.muted }}>過去イベントの同席者情報はありません。</Text>}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
