import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { addInAppNotification } from "@/lib/in-app-notifications-store";
import type { Event } from "@/constants/mock-data";
import { buildEventReminderPlans, buildFavoriteDeadlineReminderPlans, buildOrganizerReminderPlans } from "@/lib/event-reminders";
import { cancelFavoriteDeadlinePlans, cancelOrganizerDeadlinePlans, persistFavoriteDeadlinePlans, persistOrganizerDeadlinePlan, persistParticipantReminderPlans } from "@/lib/event-automation-store";
import { notificationEnabled } from "@/lib/notification-preferences";
import { getNotificationPreferences } from "@/lib/notification-preferences";
import Constants from "expo-constants";
import * as Api from "@/lib/_core/api";

const organizerNotificationIds = new Map<string, string[]>();
const favoriteNotificationIds = new Map<string, string[]>();

// 通知ハンドラーの設定（フォアグラウンドでも通知を表示）
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// 通知権限を要求する
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("iro-plus", {
      name: "IRO＋通知",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#E8A0BF",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

export async function notificationPermissionGranted() {
  if (Platform.OS === "web") return false;
  return (await Notifications.getPermissionsAsync()).status === "granted";
}

export async function registerPushNotificationsForCurrentDevice() {
  if (Platform.OS === "web") return null;
  if (!await requestNotificationPermissions()) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error("EAS projectIdが設定されていません");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await Api.registerPushToken({ token, platform: Platform.OS as "ios" | "android", preferences: await getNotificationPreferences() });
  return token;
}

export async function notifyEventConfirmation(event: Event, memberId: string, chatRoomId: string): Promise<void> {
  addInAppNotification({ targetMemberId: memberId, type: "event_confirmed", title: "イベント参加が確定しました", body: `「${event.title}」の参加者チャットを作成しました。`, eventId: event.id, chatRoomId });
  if (Platform.OS === "web") return;
  if (!await notificationEnabled("event_approved")) return;
  await Notifications.scheduleNotificationAsync({ content: { title: "イベント参加が確定しました", body: `「${event.title}」の参加者チャットを確認してください。`, data: { type: "event_confirmed", eventId: event.id, chatRoomId }, sound: true }, trigger: null });
}

export async function notifyEventCancellationRequest(event: Event, memberId: string): Promise<void> {
  addInAppNotification({ targetMemberId: event.createdBy, type: "event_cancellation", title: "キャンセル申請が届きました", body: `「${event.title}」の参加者からキャンセル申請が届きました。申請内容を確認し、再募集を判断してください。`, eventId: event.id });
  if (Platform.OS === "web") return;
  await Notifications.scheduleNotificationAsync({ content: { title: "キャンセル申請が届きました", body: `「${event.title}」のキャンセル申請を確認してください。`, data: { type: "event_cancellation", eventId: event.id, memberId }, sound: true }, trigger: null });
}

/** 端末通知を予約する。サーバー側でも同じ計画を保存し、チャットへシステム投稿する。 */
export async function scheduleEventReminders(event: Event, memberId: string, chatRoomId: string): Promise<void> {
  await persistParticipantReminderPlans(event, memberId, chatRoomId);
  const now = Date.now();
  if (!await notificationEnabled("event_reminder")) return;
  for (const plan of buildEventReminderPlans(event)) {
    if (plan.scheduledAt.getTime() <= now || Platform.OS === "web") continue;
    const label = plan.kind === "seven_days" ? "1週間前" : "2日前";
    await Notifications.scheduleNotificationAsync({ content: { title: `${event.title}は${label}です`, body: "参加者チャットで集合時間や連絡事項をご確認ください。", data: { type: "event_reminder", eventId: event.id, chatRoomId }, sound: true }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: plan.scheduledAt } });
  }
}

export async function scheduleOrganizerDeadlineNotification(event: Event): Promise<void> {
  await persistOrganizerDeadlinePlan(event);
  if (Platform.OS === "web") return;
  const identifiers: string[] = [];
  for (const plan of buildOrganizerReminderPlans(event)) {
    if (plan.scheduledAt.getTime() <= Date.now()) continue;
    identifiers.push(await Notifications.scheduleNotificationAsync({ content: { title: "参加者を確定してください", body: `「${event.title}」の参加者決定予定日の${plan.label}です。申込者を確認してください。`, data: { type: "event_deadline", eventId: event.id }, sound: true }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: plan.scheduledAt } }));
  }
  organizerNotificationIds.set(event.id, identifiers);
}

export async function cancelOrganizerDeadlineNotifications(eventId: string): Promise<void> {
  await cancelOrganizerDeadlinePlans(eventId);
  const identifiers = organizerNotificationIds.get(eventId) ?? [];
  await Promise.all(identifiers.map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)));
  organizerNotificationIds.delete(eventId);
}

export async function scheduleFavoriteDeadlineNotifications(event: Event, memberId: string): Promise<void> {
  await persistFavoriteDeadlinePlans(event, memberId);
  if (Platform.OS === "web") return;
  const identifiers: string[] = [];
  for (const plan of buildFavoriteDeadlineReminderPlans(event)) {
    if (plan.scheduledAt.getTime() <= Date.now()) continue;
    identifiers.push(await Notifications.scheduleNotificationAsync({ content: { title: "お気に入りイベントの募集期限が近づいています", body: `「${event.title}」の募集期限は${plan.label}です。申込み忘れがないかご確認ください。`, data: { type: "event_reminder", eventId: event.id }, sound: true }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: plan.scheduledAt } }));
  }
  favoriteNotificationIds.set(`${event.id}:${memberId}`, identifiers);
}

export async function cancelFavoriteDeadlineNotifications(eventId: string, memberId: string): Promise<void> {
  await cancelFavoriteDeadlinePlans(eventId, memberId);
  const key = `${eventId}:${memberId}`;
  await Promise.all((favoriteNotificationIds.get(key) ?? []).map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)));
  favoriteNotificationIds.delete(key);
}

// メンション通知を送信する
export async function sendMentionNotification(
  mentionedUserName: string,
  senderName: string,
  roomName: string,
  messagePreview: string,
): Promise<void> {
  if (Platform.OS === "web") return;
  if (!await notificationEnabled("mention")) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${senderName}さんからメンション`,
        body: `${roomName}: ${messagePreview}`,
        data: { type: "mention", roomName },
        sound: true,
      },
      trigger: null, // 即時通知
    });
  } catch (e) {
    // 通知が許可されていない場合はサイレントに失敗
    console.log("Notification not sent:", e);
  }
}

// 入部承認通知を送信する
export async function sendClubApprovalNotification(
  clubName: string,
  leaderName: string,
  applicantId: string,
  clubId: string,
): Promise<void> {
  addInAppNotification({
    targetMemberId: applicantId,
    type: "club_approval",
    title: `${clubName}への入部が承認されました`,
    body: `${leaderName}さんが入部申請を承認しました。部員限定スレッドを閲覧できます。まずは${clubName}の自己紹介スレッドへ投稿しましょう。`,
    clubId,
  });
  if (Platform.OS === "web") return;
  if (!await notificationEnabled("board_approved")) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${clubName}への入部が承認されました`,
        body: `${leaderName}さんが入部申請を承認しました。まずは${clubName}の自己紹介スレッドへ投稿しましょう。`,
        data: { type: "club_approval", clubName },
        sound: true,
      },
      trigger: null,
    });
  } catch (e) {
    console.log("Notification not sent:", e);
  }
}

// 部長任命通知を送信する
export async function sendLeaderAppointmentNotification(
  clubName: string,
  adminName: string,
): Promise<void> {
  if (Platform.OS === "web") return;
  if (!await notificationEnabled("club_leader")) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${clubName}の部長に任命されました`,
        body: `${adminName}さんから${clubName}の部長に任命されました。`,
        data: { type: "leader_appointment", clubName },
        sound: true,
      },
      trigger: null,
    });
  } catch (e) {
    console.log("Notification not sent:", e);
  }
}

// 入部申請通知を送信する（部長向け）
export async function sendClubApplicationNotification(
  clubName: string,
  applicantName: string,
  leaderId: string,
  clubId: string,
): Promise<void> {
  addInAppNotification({
    targetMemberId: leaderId,
    type: "club_application",
    title: `${clubName}に入部申請が届きました`,
    body: `${applicantName}さんから入部申請が届いています。申請内容と参加履歴を確認してください。`,
    clubId,
  });
  if (Platform.OS === "web") return;
  if (!await notificationEnabled("club_join")) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${clubName}に入部申請が届きました`,
        body: `${applicantName}さんが入部を申請しました。`,
        data: { type: "club_application", clubName },
        sound: true,
      },
      trigger: null,
    });
  } catch (e) {
    console.log("Notification not sent:", e);
  }
}

// メッセージ内のメンションを検出して通知を送信する
export async function checkAndSendMentionNotifications(
  content: string,
  senderName: string,
  roomName: string,
  participants: string[],
  getMemberByIdFn: (id: string) => { name: string; id: string } | undefined,
): Promise<void> {
  if (Platform.OS === "web") return;

  // @名前 のパターンを検出
  const mentionPattern = /@(\S+)/g;
  let match;
  const mentionedNames: string[] = [];

  while ((match = mentionPattern.exec(content)) !== null) {
    mentionedNames.push(match[1]);
  }

  if (mentionedNames.length === 0) return;

  // 参加者の中でメンションされた人を特定
  for (const participantId of participants) {
    const member = getMemberByIdFn(participantId);
    if (!member) continue;

    const isMentioned = mentionedNames.some(
      (name) => name === member.name || member.name.includes(name),
    );

    if (isMentioned) {
      // 自分自身へのメンションは通知しない
      await sendMentionNotification(
        member.name,
        senderName,
        roomName,
        content.length > 50 ? content.slice(0, 50) + "..." : content,
      );
    }
  }
}
