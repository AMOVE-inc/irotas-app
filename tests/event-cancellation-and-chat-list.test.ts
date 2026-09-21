import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("event cancellation lifecycle", () => {
  it("notifies both applicants and confirmed participants, posts to the confirmed chat, and reverses rewards", () => {
    const events = source("sites/events.ts");
    expect(events).toContain("status IN ('applied', 'confirmed', 'cancel_requested')");
    expect(events).toContain("notifyEventCancellation(db, participant.member_id");
    expect(events).toContain("event_cancel_${crypto.randomUUID()}");
    expect(events).toContain("reverseCancelledEventHostXp(env.DB, id, now)");
    expect(events).toContain("reverseEventRewards(env.DB, id, now)");
    expect(events).toContain("UPDATE events SET status = 'cancelled'");
    expect(source("sites/home-automation.ts")).toContain("WHERE e.status != 'cancelled'");
  });

  it("uses the in-app confirmation dialog so cancellation works on web as well", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain('title: "イベントを中止しますか？"');
    expect(detail).toContain("すでに参加者が確定している場合は、事前に参加者へご連絡をお願いします。");
    expect(detail).toContain("await Api.cancelEvent(event.id, true)");
  });

  it("notifies an organizer-cancelled participant in Home and the event chat", () => {
    const events = source("sites/events.ts");
    expect(events).toContain("notifyOrganizerParticipantCancellation");
    expect(events).toContain("イベントのキャンセルが確定しました");
    expect(events).toContain("event_participant_cancel_${crypto.randomUUID()}");
    expect(events).toContain("await notifyOrganizerParticipantCancellation(env.DB, row, targetId, member.id, now)");
  });

  it("uses the app confirmation dialog for organizer participant cancellation", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain('title: "参加をキャンセルしますか？"');
    expect(detail).toContain("本当にキャンセルしますか？");
  });
});

describe("chat list identity presentation", () => {
  it("excludes legacy fixture rooms and previews the latest announcement", () => {
    const chatList = source("components/chat-list-screen.tsx");
    expect(chatList).toContain("/^chat\\d+$/.test(room.id)");
    expect(chatList).toContain('room.id === "board-announcement" ? "お知らせ"');
    expect(chatList).toContain('Api.getSharedChatMessages("board-announcement")');
    expect(chatList).toContain('const announcementMessages = await Api.getSharedChatMessages("board-announcement")');
    expect(chatList).not.toContain('? { ...room, lastMessage: "", lastMessageAt: undefined }');
    expect(chatList).toContain("contentContainerStyle={{ paddingBottom: 112, flexGrow: 1 }}");
  });

  it("offers the locked event's club application route", () => {
    const events = source("app/(tabs)/events.tsx");
    expect(events).toContain("入部後にご確認をお願いします。");
    expect(events).toContain("へ入部する");
    expect(events).toContain('router.push({ pathname: "/clubs", params: { clubId: prompt.id } })');
  });

  it("uses member and event images when available and removes imported role suffixes", () => {
    const chatList = source("components/chat-list-screen.tsx");
    expect(chatList).toContain("stripRankFromName(room.name)");
    expect(chatList).toContain("member.profile.avatarUrl");
    expect(chatList).toContain("eventImages[room.sourceId]");
    expect(chatList).toContain("dmPartnerId");
  });
});
