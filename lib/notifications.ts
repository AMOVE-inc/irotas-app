import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { addInAppNotification } from "@/lib/in-app-notifications-store";

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

// メンション通知を送信する
export async function sendMentionNotification(
  mentionedUserName: string,
  senderName: string,
  roomName: string,
  messagePreview: string,
): Promise<void> {
  if (Platform.OS === "web") return;

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
    body: `${leaderName}さんが入部申請を承認しました。部員限定スレッドを閲覧できます。`,
    clubId,
  });
  if (Platform.OS === "web") return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${clubName}への入部が承認されました`,
        body: `${leaderName}さんが入部申請を承認しました。部員限定コンテンツが閲覧できます。`,
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
