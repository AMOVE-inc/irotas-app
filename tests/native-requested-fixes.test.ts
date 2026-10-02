import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gourmetMap = readFileSync("app/gourmet-map.tsx", "utf8");
const eventDetail = readFileSync("app/event-detail.tsx", "utf8");
const events = readFileSync("sites/events.ts", "utf8");
const chatServer = readFileSync("sites/chat-content.ts", "utf8");
const chatScreen = readFileSync("app/chat/index.tsx", "utf8");
const memberProfile = readFileSync("app/member-profile.tsx", "utf8");
const notifications = readFileSync("app/notifications.tsx", "utf8");
const clubs = readFileSync("sites/clubs.ts", "utf8");
const home = readFileSync("app/(tabs)/index.tsx", "utf8");

describe("requested native fixes", () => {
  it("uses the protected Places Photo endpoint immediately for legacy Google images on native", () => {
    expect(gourmetMap).toContain('Platform.OS !== "web"');
    expect(gourmetMap).toContain("/api/gourmet-map/photo?placeId=");
  });

  it("creates and exposes a participant chat after Discord recruitment closes", () => {
    expect(events).toContain("data.discordRecruitmentClosedAt = now");
    expect(events).toContain("await ensureEventRoom(env.DB, data.chatId as string)");
    expect(chatServer).toContain("discordEvent && !origin.discordRecruitmentClosedAt");
    expect(chatServer).toContain("origin.manualParticipantIds");
    expect(eventDetail).toContain("event.participants.includes(viewerId)");
    expect(events).toContain("data.chatId = chatId");
    expect(events).toContain("data.participantsFinalizedAt = finalizedAt || now");
    expect(events).toContain("closedDiscordEvent && !(typeof origin.chatId");
    expect(events).toContain("await ensureEventRoom(db, chatId)");
    expect(events).not.toContain("!importedDiscordEvent ? [env.DB.prepare");
  });

  it("lets managers reopen Discord recruitment after closing it in the app", () => {
    expect(eventDetail).toContain("handleReopenDiscordRecruitment");
    expect(eventDetail).toContain("アプリ内で募集を再開");
    expect(eventDetail).toContain("&& discordRecruitmentClosed &&");
    expect(events).toContain('input?.action === "reopen_discord_recruitment"');
    expect(events).toContain("delete data.discordRecruitmentClosedAt");
    expect(events).toContain("event.discord_recruitment_reopened");
  });

  it("keeps the additional recruitment action visible after app recruitment closes at capacity", () => {
    expect(eventDetail).toContain('event.status !== "open" ? <Pressable onPress={handleReopenGourmetRecruitment}');
    expect(eventDetail).not.toContain('event.status !== "open" && (Boolean(event.capacityMode)');
    expect(eventDetail).toContain("定員に達しています。イベント情報を編集して募集定員を増やしてください。");
    expect(eventDetail).toContain('title: "追加募集できません"');
    expect(eventDetail).toContain('buttons: [{ text: "OK", style: "cancel" }]');
    expect(events).toContain("定員に達しています。イベント情報を編集して募集定員を増やしてください。");
  });

  it("accepts only poll reactions matching a poll choice", () => {
    expect(chatServer).toContain('const isPollVote = emoji.startsWith("🗳️")');
    expect(chatServer).toContain("isValidPollVote(row.content, emoji)");
  });

  it("opens applicant profiles from the application count sheet", () => {
    expect(eventDetail).toContain("参加申込者一覧を表示");
    expect(eventDetail).toContain("参加申込者（{applicantCount}人）");
    expect(eventDetail).toContain("<MemberRankBadge rank={rank}");
    expect(eventDetail).toContain("参加確定者一覧を表示");
    expect(eventDetail).toContain("参加確定者（{confirmedParticipantIds.length}人）");
  });

  it("deduplicates event confirmation notifications by event and participant", () => {
    expect(events).toContain("INSERT OR IGNORE INTO in_app_notifications");
    expect(events).toContain("`event-confirmed:${eventId}:${targetMemberId}`");
  });

  it("does not count system chat history as unread messages", () => {
    expect(chatServer.match(/cm\.content NOT LIKE '【IRO\+ システム】%'/g)).toHaveLength(4);
  });

  it("places chat timestamps beside bubbles like LINE", () => {
    expect(chatScreen).toContain('testID="chat-message-time-left"');
    expect(chatScreen).toContain('testID="chat-message-time-right"');
    expect(chatScreen).toContain('alignItems: "flex-end"');
  });

  it("waits for the authoritative room before showing access denied", () => {
    expect(chatScreen).toContain("const [isLoadingRoom, setIsLoadingRoom] = useState(true)");
    expect(chatScreen).toContain("if (isLoadingRoom && !clubAccessDenied");
    expect(chatScreen).toContain('<ActivityIndicator color="#E8A0BF" />');
  });

  it("returns from a participant profile to the open participant list", () => {
    expect(chatScreen).toContain('returnToChatParticipants: "1"');
    expect(chatScreen).toContain('openParticipants === "1"');
    expect(memberProfile).toContain('returnToChatParticipants === "1" && chatId');
    expect(memberProfile).toContain('openParticipants: "1"');
  });

  it("does not require organizers to manually finalize actual attendance", () => {
    expect(eventDetail).not.toContain("onPress={handleFinalizeAttendance}");
  });

  it("starts the message composer at one line and grows it to about six lines", () => {
    expect(chatScreen).toContain("<ExpandingMessageInput");
    expect(chatScreen).toContain('from "@/components/expanding-message-input"');
  });

  it("shows poll percentages, counts, and a proportional result bar", () => {
    expect(chatScreen).toContain("totalVotes");
    expect(chatScreen).toContain("Math.round((voters.length / totalVotes) * 100)");
    expect(chatScreen).toContain('width: `${percentage}%`');
    expect(chatScreen).toContain("{voteCounts[index]}票");
  });

  it("deep links club applications to the club management review", () => {
    expect(clubs).toContain("reviewApplications=1");
    expect(notifications).toContain('notification.targetPath?.startsWith("/clubs?")');
  });

  it("keeps the club event locked while exposing the organizer profile button", () => {
    expect(home).toContain("event.lockedClubEvent && event.organizerProfileId");
    expect(home).toContain('pathname: "/member-profile"');
  });
});
