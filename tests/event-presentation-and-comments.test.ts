import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("event presentation and comments", () => {
  it("keeps all event states discoverable and offers an availability filter", () => {
    const events = source("app/(tabs)/events.tsx");
    expect(events).toContain('const [openOnly, setOpenOnly] = useState(false)');
    expect(events).toContain('label: "空席あり"');
  });

  it("hides past official events from the public event list", () => {
    const events = source("app/(tabs)/events.tsx");
    expect(events).toContain('event.eventType !== "official" || !isPastEventDate(event)');
    expect(events).toContain("isPastEventDate(event)");
    expect(events).toContain("data={visibleEvents}");
  });

  it("does not show selection method on official event cards", () => {
    const events = source("app/(tabs)/events.tsx");
    expect(events).not.toContain('event.selectionMethod === "lottery" ? "抽選" : "先着順"');
    expect(events).not.toContain("minHeight: 138");
  });

  it("does not render empty rank price data as rank pricing", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain('evt.eventType === "official"');
    expect(detail).toContain("EVENT_RANKS.some");
  });

  it("allows event comments to select and open individual member mentions", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain("members={eventMentionMembers}");
    expect(detail).toContain("memberDirectory.find");
    expect(detail).toContain("@で会員・部活・支部をメンションできます。");
    expect(detail).toContain("displayCommentAuthor");
    expect(detail).toContain("<MemberClubLeaderBadges roles={author.roles} name={author.badgeName} compact />");
  });

  it("opens an in-app long-press menu for event comment actions", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain("onLongPress={() => { setEventCommentShowAllReactions(false); setEventCommentActionTarget(comment); }}");
    expect(detail).toContain('label: "返信"');
    expect(detail).toContain('label: "テキストをコピー"');
    expect(detail).toContain('label: "メッセージリンクをコピー"');
    expect(detail).toContain('label: "コメントを編集"');
    expect(detail).toContain('label: "コメントを削除"');
    expect(detail).toContain("eventCommentActionTarget?.canEdit");
    expect(source("sites/events.ts")).toContain("canEdit:");
  });

  it("places the reply cursor after the inserted mention", () => {
    const detail = source("app/event-detail.tsx");
    const board = source("app/(tabs)/board.tsx");
    const chat = source("app/chat/index.tsx");
    expect(detail).toContain("setEventCommentSelection({ start: text.length, end: text.length })");
    expect(board).toContain("setCommentSelection({ start: text.length, end: text.length })");
    expect(chat).toContain("setMessageSelection({ start: text.length, end: text.length })");
  });

  it("does not schedule sender-side local notifications for server-owned mentions", () => {
    expect(source("app/event-detail.tsx")).not.toContain("sendMentionNotification");
    expect(source("app/(tabs)/board.tsx")).not.toContain("sendMentionNotification");
  });

  it("uses a light gray background for reply references", () => {
    expect(source("components/reply-reference-view.tsx")).toContain('backgroundColor: "#F1F2F4"');
  });

  it("lets members add persistent stamps to event comments without notifying the organizer", () => {
    const detail = source("app/event-detail.tsx");
    const api = source("lib/_core/api.ts");
    const server = source("sites/events.ts");
    const migration = source("drizzle/0054_event_comment_reactions.sql");
    expect(detail).toContain("EVENT_COMMENT_REACTION_EMOJIS");
    expect(detail).toContain("EVENT_COMMENT_QUICK_REACTIONS");
    expect(detail).toContain('accessibilityLabel="他のスタンプを表示"');
    expect(detail).toContain("setEventCommentShowAllReactions(true)");
    expect(detail).toContain("handleEventCommentReaction");
    expect(api).toContain("setEventCommentReaction");
    expect(server).toContain("EVENT_COMMENT_REACTION_PATH");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS event_comment_reactions");
    const favoriteHandler = server.slice(server.indexOf("if (favoriteMatch && request.method === \"PUT\")"), server.indexOf("if (applicationMatch && request.method === \"POST\")"));
    expect(favoriteHandler).not.toContain("in_app_notifications");
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

  it("gives organizers and companions a stateful participant-chat CTA", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain("(isJoined || isOrganizer || isCompanion) && chatRoomId");
    expect(detail).toContain("幹事イベント（参加者募集中）");
    expect(detail).toContain("幹事イベント（参加者確定済み）");
  });

  it("labels upcoming organizer events clearly and keeps past dates in the history view", () => {
    const profile = source("app/(tabs)/profile.tsx");
    const myEvents = source("app/my-events.tsx");
    expect(profile).toContain("イベント予定");
    expect(profile).toContain('router.push("/my-events"');
    expect(myEvents).toContain('title: "自分が幹事のイベント"');
    expect(myEvents).toContain('title: "過去のイベント"');
    expect(myEvents).toContain("isPastEventDate(event");
  });

  it("uses the recruited-member count, excluding companions, for event-card availability", () => {
    const events = source("app/(tabs)/events.tsx");
    expect(events).toContain("getConfirmedRecruitParticipantCount(event)");
  });

  it("renders event system notices as centered text, with day separators and no avatar on outgoing messages", () => {
    const chat = source("app/chat/index.tsx");
    expect(chat).toContain('message.content.startsWith("【IRO+ システム】")');
    expect(chat).toContain("function systemMessageText");
    expect(chat).toContain("参加者専用グループが作成されました");
    expect(chat).toContain("if (isSystemMessage)");
    expect(chat).toContain("!isMe && avatarSource");
    expect(chat).toContain('new Intl.DateTimeFormat("ja-JP"');
    expect(chat).toContain('timeZone: JAPAN_TIME_ZONE');
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
    const detail = source("app/event-detail.tsx");
    expect(create).toContain("const [formError, setFormError]");
    expect(create).toContain('accessibilityRole="alert"');
    expect(create).toContain("description: savedFields.description");
    expect(create).toContain("requireImage: false");
    expect(create).toContain("写真（任意・最大10枚）");
    expect(create).toContain("allowsMultipleSelection: true");
    expect(detail).toContain("イベント写真");
    expect(detail).toContain("event.images!.map");
  });
});
