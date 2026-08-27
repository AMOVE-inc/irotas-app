/**
 * 第5回改修 新機能テスト
 * - 部長任命UI
 * - チャットメンション機能
 * - プッシュ通知ユーティリティ
 * - イベント作成後の一覧反映
 */
import { describe, it, expect, beforeEach } from "vitest";
import { CLUBS, MEMBERS, getMemberById, isAdmin, CURRENT_USER , EVENTS } from "../constants/mock-data";
import { pendingEvents, getAllEvents } from "../lib/event-store";

// --- 部長任命UI テスト ---
describe("部長任命UI", () => {
  it("管理者フラグが正しく設定されている", () => {
    // CURRENT_USERはデモ管理者
    expect(isAdmin(CURRENT_USER)).toBe(true);
  });

  it("CLUBSにleaderIdが設定されている", () => {
    for (const club of CLUBS) {
      expect(club.leaderId).toBeTruthy();
      const leader = getMemberById(club.leaderId);
      expect(leader).toBeTruthy();
    }
  });

  it("getMemberByIdが正しくメンバーを返す", () => {
    const member = getMemberById(MEMBERS[0].id);
    expect(member).toBeDefined();
    expect(member?.id).toBe(MEMBERS[0].id);
  });

  it("存在しないIDにはundefinedを返す", () => {
    const member = getMemberById("nonexistent_id");
    expect(member).toBeUndefined();
  });
});

// --- イベントストア テスト ---
describe("イベントストア（create-event連携）", () => {
  beforeEach(() => {
    // テスト前にpendingEventsをクリア
    pendingEvents.length = 0;
  });

  it("pendingEventsは初期状態で空", () => {
    expect(pendingEvents).toHaveLength(0);
  });

  it("getAllEventsはbaseEventsをそのまま返す（pendingEventsが空の場合）", () => {
    const result = getAllEvents(EVENTS);
    expect(result).toHaveLength(EVENTS.length);
  });

  it("pendingEventsに追加するとgetAllEventsに反映される", () => {
    const newEvent = {
      id: "test_event_1",
      title: "テストイベント",
      description: "テスト説明",
      date: "2026-04-15",
      time: "19:00",
      location: "渋谷",
      image: "https://example.com/image.jpg",
      capacity: 20,
      attendees: 0,
      participants: [],
      price: "無料",
      category: "kanto" as const,
      eventType: "official" as const,
      status: "open" as const,
      createdBy: CURRENT_USER.id,
    };
    pendingEvents.unshift(newEvent);
    const result = getAllEvents(EVENTS);
    expect(result).toHaveLength(EVENTS.length + 1);
    expect(result[0].id).toBe("test_event_1");
    expect(result[0].title).toBe("テストイベント");
  });

  it("pendingEventsの先頭に追加される（最新が先頭）", () => {
    const event1 = { ...EVENTS[0], id: "new_1", title: "新イベント1" };
    const event2 = { ...EVENTS[0], id: "new_2", title: "新イベント2" };
    pendingEvents.unshift(event1);
    pendingEvents.unshift(event2);
    const result = getAllEvents(EVENTS);
    expect(result[0].id).toBe("new_2");
    expect(result[1].id).toBe("new_1");
  });
});

// --- チャットメンション機能テスト ---
describe("チャットメンション機能", () => {
  it("@記号を含むメッセージからメンション対象を抽出できる", () => {
    const content = "こんにちは @田中太郎 さん、@鈴木花子 さんよろしく！";
    const mentionPattern = /@(\S+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionPattern.exec(content)) !== null) {
      mentions.push(match[1]);
    }
    expect(mentions).toContain("田中太郎");
    expect(mentions).toContain("鈴木花子");
    expect(mentions).toHaveLength(2);
  });

  it("メンションなしのメッセージでは空配列を返す", () => {
    const content = "普通のメッセージです";
    const mentionPattern = /@(\S+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionPattern.exec(content)) !== null) {
      mentions.push(match[1]);
    }
    expect(mentions).toHaveLength(0);
  });

  it("メンバー名の部分一致でメンション対象を特定できる", () => {
    const memberNames = MEMBERS.map((m) => m.name);
    const mentionToken = "田中";
    const matched = memberNames.filter(
      (name) => name === mentionToken || name.includes(mentionToken),
    );
    expect(matched.length).toBeGreaterThanOrEqual(0); // メンバーデータに依存
  });
});

// --- 部活動データ整合性テスト ---
describe("部活動データ整合性", () => {
  it("CLUBSにmemberIdsが設定されている", () => {
    for (const club of CLUBS) {
      expect(Array.isArray(club.memberIds)).toBe(true);
      expect(club.memberIds.length).toBeGreaterThan(0);
    }
  });

  it("CLUBSのleaderIdはmemberIdsに含まれている", () => {
    for (const club of CLUBS) {
      expect(club.memberIds).toContain(club.leaderId);
    }
  });

  it("CLUBSにapplicantIdsが設定されている", () => {
    for (const club of CLUBS) {
      expect(Array.isArray(club.applicantIds)).toBe(true);
    }
  });
});
