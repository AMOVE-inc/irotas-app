import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Event } from "@/constants/mock-data";
import { addMessage, saveMessagesToStorage } from "@/lib/chat-store";
import { addInAppNotification } from "@/lib/in-app-notifications-store";
import { buildEventReminderPlans , buildFavoriteDeadlineReminderPlans, buildOrganizerReminderPlans } from "@/lib/event-reminders";
import { EVENTS } from "@/constants/mock-data";
import { getAllEvents } from "@/lib/event-store";

const KEY = "irotas_scheduled_event_actions";
type ScheduledAction = {
  id: string;
  kind: "seven_days" | "two_days" | "organizer_three_days" | "organizer_two_days" | "organizer_one_day" | "organizer_same_day" | "favorite_three_days" | "favorite_one_day";
  eventId: string;
  eventTitle: string;
  targetMemberId: string;
  chatRoomId?: string;
  scheduledAt: string;
};

async function readActions(): Promise<ScheduledAction[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]") as ScheduledAction[]; } catch { return []; }
}

async function mergeActions(actions: ScheduledAction[]): Promise<void> {
  const current = await readActions();
  const merged = [...current];
  for (const action of actions) if (!merged.some((item) => item.id === action.id)) merged.push(action);
  await AsyncStorage.setItem(KEY, JSON.stringify(merged));
}

export async function persistParticipantReminderPlans(event: Event, memberId: string, chatRoomId: string): Promise<void> {
  await mergeActions(buildEventReminderPlans(event).map((plan) => ({ id: `${event.id}:${memberId}:${plan.kind}`, kind: plan.kind, eventId: event.id, eventTitle: event.title, targetMemberId: memberId, chatRoomId, scheduledAt: plan.scheduledAt.toISOString() })));
}

export async function persistOrganizerDeadlinePlan(event: Event): Promise<void> {
  await mergeActions(buildOrganizerReminderPlans(event).map((plan) => ({ id: `${event.id}:${event.createdBy}:${plan.kind}`, kind: plan.kind, eventId: event.id, eventTitle: event.title, targetMemberId: event.createdBy, scheduledAt: plan.scheduledAt.toISOString() })));
}

export async function cancelOrganizerDeadlinePlans(eventId: string): Promise<void> {
  const actions = await readActions();
  await AsyncStorage.setItem(KEY, JSON.stringify(actions.filter((action) => !(action.eventId === eventId && action.kind.startsWith("organizer_")))));
}

export async function persistFavoriteDeadlinePlans(event: Event, memberId: string): Promise<void> {
  await mergeActions(buildFavoriteDeadlineReminderPlans(event).map((plan) => ({ id: `${event.id}:${memberId}:${plan.kind}`, kind: plan.kind, eventId: event.id, eventTitle: event.title, targetMemberId: memberId, scheduledAt: plan.scheduledAt.toISOString() })));
}

export async function cancelFavoriteDeadlinePlans(eventId: string, memberId: string): Promise<void> {
  const actions = await readActions();
  await AsyncStorage.setItem(KEY, JSON.stringify(actions.filter((action) => !(action.eventId === eventId && action.targetMemberId === memberId && action.kind.startsWith("favorite_")))));
}

/** アプリ起動中に期限へ達した処理を配信。DB版では同じIDでバックグラウンドワーカーが実行する。 */
export async function dispatchDueEventActions(now = new Date()): Promise<number> {
  const actions = await readActions();
  const due = actions.filter((action) => Date.parse(action.scheduledAt) <= now.getTime());
  const remaining = actions.filter((action) => Date.parse(action.scheduledAt) > now.getTime());
  for (const action of due) {
    if (action.kind.startsWith("favorite_")) {
      const currentEvent = getAllEvents(EVENTS).find((item) => item.id === action.eventId);
      if (currentEvent?.status === "open") {
        const label = action.kind === "favorite_three_days" ? "3日前" : "前日";
        addInAppNotification({ targetMemberId: action.targetMemberId, type: "event_reminder", title: "お気に入りイベントの募集期限が近づいています", body: `「${action.eventTitle}」の募集期限は${label}です。申込み忘れがないかご確認ください。`, eventId: action.eventId });
      }
    } else if (action.kind.startsWith("organizer_")) {
      const currentEvent = getAllEvents(EVENTS).find((item) => item.id === action.eventId);
      if (!currentEvent?.participantsFinalizedAt) {
        const label = action.kind === "organizer_three_days" ? "3日前" : action.kind === "organizer_two_days" ? "2日前" : action.kind === "organizer_one_day" ? "前日" : "当日";
        addInAppNotification({ targetMemberId: action.targetMemberId, type: "event_deadline", title: "参加者を確定してください", body: `「${action.eventTitle}」の参加者決定予定日の${label}です。申込者を確認してください。`, eventId: action.eventId });
      }
    } else if (action.chatRoomId) {
      const label = action.kind === "seven_days" ? "1週間前" : "2日前";
      const message = addMessage(action.chatRoomId, "system", `【自動リマインド】「${action.eventTitle}」の開催${label}です。集合時間や連絡事項をご確認ください。`);
      await saveMessagesToStorage(action.chatRoomId, [message]);
      addInAppNotification({ targetMemberId: action.targetMemberId, type: "event_reminder", title: `${action.eventTitle}は${label}です`, body: "参加者チャットをご確認ください。", eventId: action.eventId, chatRoomId: action.chatRoomId });
    }
  }
  if (due.length) await AsyncStorage.setItem(KEY, JSON.stringify(remaining));
  return due.length;
}
