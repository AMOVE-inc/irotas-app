import AsyncStorage from "@react-native-async-storage/async-storage";
import { EVENTS, CURRENT_USER, type Event } from "@/constants/mock-data";
import { getAllEvents } from "@/lib/event-store";
import { getEventParticipationStatus } from "@/lib/event-participation";
import * as Api from "@/lib/_core/api";
import { useAuthContext } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

const DISMISSED_KEY_PREFIX = "irotas_gourmet_report_reminder_dismissed";
const REPORT_XP = 8;

function getTokyoDate(offsetDays = 0): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const format = (date: Date) => {
    const parts = formatter.formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  };
  const today = format(new Date());
  const value = new Date(`${today}T12:00:00+09:00`);
  value.setDate(value.getDate() + offsetDays);
  return format(value);
}

function getEligibleEvents(events: Event[], memberId: string): Event[] {
  const yesterday = getTokyoDate(-1);
  return events.filter((event) => (
    event.eventType === "gourmet"
    && event.date === yesterday
    && getEventParticipationStatus(event, memberId) === "confirmed"
  ));
}

/** 開催翌日に、グルメ会の参加確定者だけへごちそうさま報告を案内する。 */
export function GourmetReportReminderGate() {
  const router = useRouter();
  const { user } = useAuthContext();
  const [event, setEvent] = useState<Event | null>(null);
  const memberId = user?.memberId ?? (user ? CURRENT_USER.id : null);

  const dismiss = useCallback(async (eventId?: string) => {
    if (memberId && eventId) {
      await AsyncStorage.setItem(`${DISMISSED_KEY_PREFIX}:${memberId}:${eventId}`, "1");
    }
    setEvent(null);
  }, [memberId]);

  useEffect(() => {
    if (!memberId) {
      setEvent(null);
      return;
    }
    let active = true;
    void (async () => {
      let events = getAllEvents(EVENTS);
      try {
        const sharedEvents = await Api.getEvents();
        const sharedIds = new Set(sharedEvents.map((item) => item.id));
        events = [...sharedEvents, ...events.filter((item) => !sharedIds.has(item.id))];
      } catch {
        // オフライン時もローカルイベントを使って案内できる。
      }
      const candidates = getEligibleEvents(events, memberId);
      for (const candidate of candidates) {
        const dismissed = await AsyncStorage.getItem(`${DISMISSED_KEY_PREFIX}:${memberId}:${candidate.id}`);
        if (active && !dismissed) {
          setEvent(candidate);
          return;
        }
      }
      if (active) setEvent(null);
    })();
    return () => { active = false; };
  }, [memberId]);

  if (!event) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => { void dismiss(event.id); }}>
      <View style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: "#FFF", borderRadius: 24, padding: 24 }}>
          <Text style={{ fontSize: 30, textAlign: "center", marginBottom: 10 }}>🍽️</Text>
          <Text style={{ color: "#202124", fontSize: 20, fontWeight: "800", textAlign: "center" }}>
            昨日のグルメ会はいかがでしたか？
          </Text>
          <Text style={{ color: "#5F6368", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 12 }}>
            「{event.title}」でのごちそうを、写真と一緒にみんなへシェアしませんか？
          </Text>
          <View style={{ backgroundColor: "#FFF5E8", borderRadius: 14, padding: 13, marginTop: 18 }}>
            <Text style={{ color: "#B56B00", fontSize: 14, fontWeight: "800", textAlign: "center" }}>
              ごちそうさま報告を投稿すると +{REPORT_XP} XP を獲得できます
            </Text>
          </View>
          <Pressable
            onPress={() => {
              void dismiss(event.id);
              router.push({ pathname: "/board", params: { compose: "meal-report" } });
            }}
            style={{ backgroundColor: "#D97FA8", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 18 }}
          >
            <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "800" }}>ごちそうさま報告を送る</Text>
          </Pressable>
          <Pressable onPress={() => { void dismiss(event.id); }} style={{ paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ color: "#777", fontSize: 14, fontWeight: "700" }}>あとで見る</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
