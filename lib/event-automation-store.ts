import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Event } from "@/constants/mock-data";
import { addMessage, saveMessagesToStorage } from "@/lib/chat-store";
import { addInAppNotification } from "@/lib/in-app-notifications-store";
import { buildEventReminderPlans, parseApplicationDeadline } from "@/lib/event-reminders";

const KEY = "irotas_scheduled_event_actions";
type ScheduledAction = {
  id: string;
  kind: "seven_days" | "two_days" | "organizer_deadline";
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
  const deadline = parseApplicationDeadline(event.applicationDeadline);
  if (!deadline) return;
  await mergeActions([{ id: `${event.id}:${event.createdBy}:organizer_deadline`, kind: "organizer_deadline", eventId: event.id, eventTitle: event.title, targetMemberId: event.createdBy, scheduledAt: deadline.toISOString() }]);
}

/** アプリ起動中に期限へ達した処理を配信。DB版では同じIDでバックグラウンドワーカーが実行する。 */
export async function dispatchDueEventActions(now = new Date()): Promise<number> {
  const actions = await readActions();
  const due = actions.filter((action) => Date.parse(action.scheduledAt) <= now.getTime());
  const remaining = actions.filter((action) => Date.parse(action.scheduledAt) > now.getTime());
  for (const action of due) {
    if (action.kind === "organizer_deadline") {
      addInAppNotification({ targetMemberId: action.targetMemberId, type: "event_deadline", title: "参加者を確定してください", body: `「${action.eventTitle}」の募集期限になりました。申込者を確認してください。`, eventId: action.eventId });
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
