import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Event } from "@/constants/mock-data";
import { eligibleGourmetReportEvents, gourmetReportReminderKey } from "@/lib/gourmet-report-reminder";
import { isOperatorRole } from "@/lib/access-control";
import { japanDateKey } from "@/lib/japan-date";
import * as Api from "@/lib/_core/api";
import { useAuthContext } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Modal, Pressable, Text, View } from "react-native";

const REPORT_XP = 8;

/** 開催翌日から、グルメ会の参加者へごちそうさま報告を案内する。 */
export function GourmetReportReminderGate() {
  const router = useRouter();
  const { user } = useAuthContext();
  const [event, setEvent] = useState<Event | null>(null);
  const memberId = user?.memberId ?? null;
  const earnsXp = !isOperatorRole(user?.role, user?.accessRole);

  const dismiss = useCallback(async (eventId?: string) => {
    if (memberId && eventId) {
      await AsyncStorage.setItem(gourmetReportReminderKey(memberId, eventId), japanDateKey());
    }
    setEvent(null);
  }, [memberId]);

  useEffect(() => {
    if (!memberId) {
      setEvent(null);
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        // Only authenticated server participation may trigger a reminder.
        const events = await Api.getEvents();
        const candidates = eligibleGourmetReportEvents(events, memberId);
        for (const candidate of candidates) {
          const dismissed = await AsyncStorage.getItem(gourmetReportReminderKey(memberId, candidate.id));
          if (active && dismissed !== "1" && dismissed !== japanDateKey()) {
            setEvent(candidate);
            return;
          }
        }
        if (active) setEvent(null);
      } catch {
        // Do not infer attendance from bundled fixtures when offline.
        if (active) setEvent(null);
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 60 * 60_000);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [memberId]);

  if (!event) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => { void dismiss(event.id); }}>
      <View style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: "#FFF", borderRadius: 24, padding: 24 }}>
          <Text style={{ fontSize: 30, textAlign: "center", marginBottom: 10 }}>🍽️</Text>
          <Text style={{ color: "#202124", fontSize: 20, fontWeight: "800", textAlign: "center" }}>
            ごちそうさま報告をしませんか？
          </Text>
          <Text style={{ color: "#5F6368", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 12 }}>
            「{event.title}」でのごちそうを、写真と一緒にみんなへシェアしませんか？
          </Text>
          {earnsXp ? <View style={{ backgroundColor: "#FFF5E8", borderRadius: 14, padding: 13, marginTop: 18 }}>
            <Text style={{ color: "#B56B00", fontSize: 14, fontWeight: "800", textAlign: "center" }}>
              写真付きのごちそうさま報告を投稿すると +{REPORT_XP} XP を獲得できます
            </Text>
          </View> : null}
          <Pressable
            onPress={() => {
              void dismiss(event.id);
              router.push({ pathname: "/board", params: { compose: "meal-report", reminderEventId: event.id } });
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

/** 管理者が公開前に文言と導線を確認するための、実データを使わないプレビュー。 */
export function GourmetReportReminderPreview() {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} />;
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: "#FFF", borderRadius: 24, padding: 24 }}>
          <Text style={{ fontSize: 30, textAlign: "center", marginBottom: 10 }}>🍽️</Text>
          <Text style={{ color: "#202124", fontSize: 20, fontWeight: "800", textAlign: "center" }}>
            昨日のグルメ会はいかがでしたか？
          </Text>
          <Text style={{ color: "#5F6368", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 12 }}>
            「恵比寿のおすすめイタリアン会」でのごちそうを、写真と一緒にみんなへシェアしませんか？
          </Text>
          <View style={{ backgroundColor: "#FFF5E8", borderRadius: 14, padding: 13, marginTop: 18 }}>
            <Text style={{ color: "#B56B00", fontSize: 14, fontWeight: "800", textAlign: "center" }}>
              ごちそうさま報告を投稿すると +{REPORT_XP} XP を獲得できます
            </Text>
          </View>
          <Pressable
            onPress={() => router.push({ pathname: "/board", params: { compose: "meal-report" } })}
            style={{ backgroundColor: "#D97FA8", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 18 }}
          >
            <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "800" }}>ごちそうさま報告を送る</Text>
          </Pressable>
          <Pressable onPress={() => setVisible(false)} style={{ paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ color: "#777", fontSize: 14, fontWeight: "700" }}>あとで見る</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
