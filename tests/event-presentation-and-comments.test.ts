import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("event presentation and comments", () => {
  it("filters the event list to events with availability by default", () => {
    expect(source("app/(tabs)/events.tsx")).toContain('const [openOnly, setOpenOnly] = useState(true)');
  });

  it("keeps past official events in the public event history", () => {
    const events = source("app/(tabs)/events.tsx");
    expect(events).toContain("const visibleEvents = filteredEvents");
    expect(events).toContain("isPastEventDate(event)");
    expect(events).toContain("data={visibleEvents}");
  });

  it("shows selection method only for official event cards", () => {
    expect(source("app/(tabs)/events.tsx")).toContain('event.eventType === "official" && event.selectionMethod');
  });

  it("does not render empty rank price data as rank pricing", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain('evt.eventType === "official"');
    expect(detail).toContain("EVENT_RANKS.some");
  });

  it("allows event comments to select and open individual member mentions", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain("members={MEMBERS}");
    expect(detail).toContain("memberDirectory.find");
    expect(detail).toContain("@で会員・部活・支部をメンションできます。");
    expect(detail).toContain("displayCommentAuthor");
    expect(detail).toContain("<MemberClubLeaderBadges roles={author.roles} name={author.badgeName} compact />");
  });

  it("opens an in-app long-press menu for event comment actions", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain("onLongPress={() => setEventCommentActionTarget(comment)}");
    expect(detail).toContain('label: "返信"');
    expect(detail).toContain('label: "テキストをコピー"');
    expect(detail).toContain('label: "メッセージリンクをコピー"');
    expect(detail).toContain('label: "コメントを編集"');
    expect(detail).toContain('label: "コメントを削除"');
    expect(detail).toContain("eventCommentActionTarget.authorId === viewerMemberId");
    expect(detail).toContain("userIsOperator");
  });

  it("lets operators edit events imported from Discord", () => {
    const detail = source("app/event-detail.tsx");
    const create = source("app/create-event.tsx");
    const server = source("sites/events.ts");
    expect(detail).toContain('isDiscordImportedEvent && userIsOperator');
    expect(create).toContain('isAdminRole(authUser?.role, authUser?.accessRole)');
    expect(server).toContain('id.startsWith("discord-event-") && elevated');
    expect(server).toContain('materializeImportedEvent(env.DB, id, elevated ? member.id : undefined)');
    expect(server).toContain('materializedOrganizerFallback: true');
  });

  it("uses the complete badge set for confirmed participants", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain("<MemberRankBadge rank={member.rank} name={member.badgeName} role={member.role} compact />");
    expect(detail).toContain("<MemberClubLeaderBadges roles={member.roles} name={member.badgeName} compact />");
    expect(detail).toContain('<MemberRoleBadge name="" role={member.role} compact />');
  });

  it("keeps the detail screen in a loading state until its event lookup resolves", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain("const [eventLoading, setEventLoading]");
    expect(detail).toContain("読み込み中…");
    expect(detail).toContain("setEventResolved(true)");
  });

  it("loads real member records for mention suggestions rather than rendering fixture members", () => {
    const mentionUi = source("components/mention-ui.tsx");
    expect(mentionUi).toContain("Api.getMemberDirectory()");
    expect(mentionUi).toContain("member.displayName");
    expect(mentionUi).toContain("memberIds?: readonly string[]");
  });

  it("gives organizers a stateful participant-chat CTA", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain("(isJoined || isOrganizer) && chatRoomId");
    expect(detail).toContain("幹事イベント（参加者募集中）");
    expect(detail).toContain("幹事イベント（参加者確定済み）");
  });

  it("labels upcoming organizer events clearly and keeps past dates in the history view", () => {
    const profile = source("app/(tabs)/profile.tsx");
    const myEvents = source("app/my-events.tsx");
    expect(profile).toContain("自分が幹事のイベント");
    expect(profile).toContain("!isPastEventDate(event)");
    expect(myEvents).toContain('title: "自分が幹事のイベント"');
    expect(myEvents).toContain('title: "過去のイベント"');
    expect(myEvents).toContain("isPastEventDate(event");
  });

  it("uses the recruited-member count, excluding companions, for event-card availability", () => {
    const events = source("app/(tabs)/events.tsx");
    expect(events).toContain("getConfirmedRecruitParticipantCount(event)");
  });

  it("renders event system notices as centered text, with day separators and no avatar on outgoing messages", () => {
    const chat = source("app/chat.tsx");
    expect(chat).toContain('message.content.startsWith("【IRO+ システム】")');
    expect(chat).toContain("function systemMessageText");
    expect(chat).toContain("参加者専用グループが作成されました");
    expect(chat).toContain("if (isSystemMessage)");
    expect(chat).toContain("!isMe && avatarSource");
    expect(chat).toContain("toLocaleDateString(\"ja-JP\"");
  });

  it("keeps only the lower participant-chat CTA and labels confirmed profile events", () => {
    const detail = source("app/event-detail.tsx");
    const profile = source("app/(tabs)/profile.tsx");
    expect(detail).not.toContain("参加済みチャットバナー");
    expect(detail).toContain("参加者チャットを開く");
    expect(profile).toContain('confirmed ? "参加確定" : "参加申込中"');
  });

  it("shows inline validation feedback and does not fill an omitted public note", () => {
    const create = source("app/create-event.tsx");
    expect(create).toContain("const [formError, setFormError]");
    expect(create).toContain('accessibilityRole="alert"');
    expect(create).toContain("description: savedFields.description");
    expect(create).toContain("requireImage: true");
  });
});
