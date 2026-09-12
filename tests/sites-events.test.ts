import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lockedClubEventPreview, sanitizeEvent } from "../sites/events";
import { eventCapacityLabel, eventFormSaveFields, eventFormValuesFromEvent, validateEventForm } from "../lib/event-form";
import type { Event } from "../constants/mock-data";

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventType: "gourmet",
    title: "恵比寿グルメ会",
    restaurantName: "テストレストラン",
    description: "説明",
    date: "2026-09-20",
    time: "19:15",
    location: "東京都渋谷区恵比寿1-1-1",
    prefecture: "東京都",
    tokyoArea: "ebisu-daikanyama-nakameguro",
    image: "/api/event-images/events%2F1%2Fsample.jpg",
    capacity: 5,
    reservationCapacity: 6,
    genres: ["居酒屋"],
    companionIds: [],
    price: "8,000円",
    priceMin: 8000,
    priceMax: 8000,
    category: "kanto",
    applicationDeadline: "2026-09-15",
    cancellationPolicy: "1週間前より100%",
    selectionMethod: "first_come",
    ...overrides,
  };
}

describe("production event validation", () => {
  it("accepts a valid 15-minute event and resets participation state", () => {
    expect(sanitizeEvent(validEvent())).toMatchObject({
      title: "恵比寿グルメ会",
      time: "19:15",
      status: "open",
      participants: [],
      applicantIds: [],
    });
  });

  it("rejects invalid times, remote image URLs, and deadlines after the event", () => {
    expect(sanitizeEvent(validEvent({ time: "19:10" }))).toBeNull();
    expect(sanitizeEvent(validEvent({ image: "https://example.com/a.jpg" }))).toBeNull();
    expect(sanitizeEvent(validEvent({ applicationDeadline: "2026-09-21" }))).toBeNull();
  });

  it("keeps undecided and unlimited recruitment capacity distinct from a numeric limit", () => {
    for (const mode of ["undecided", "unlimited"] as const) {
      const accepted = sanitizeEvent(validEvent({ capacity: 0, capacityMode: mode }));
      expect(accepted?.capacityMode).toBe(mode);
      expect(eventCapacityLabel(accepted as Event)).toBe(mode === "undecided" ? "未定" : "上限なし");
      const form = eventFormValuesFromEvent({ ...validEvent(), ...accepted, id: "event-test", createdBy: "member-1" } as Event);
      expect(form.recruitCapacity).toBe(mode);
      expect(validateEventForm(form, { requireImage: false, allowPastDate: true, allowEmptyGenres: true })).toBeNull();
      expect(eventFormSaveFields(form)).toMatchObject({ capacity: 0, capacityMode: mode });
    }
    expect(sanitizeEvent(validEvent({ capacity: 0 }))).toBeNull();
  });

  it("returns only a safe preview for a club event visible to a non-member", () => {
    const preview = lockedClubEventPreview({
      id: "event-club-1",
      organizer_member_id: 20,
      public_member_id: "IRO0020",
      organizer_display_name: "パン部長",
      organizer_member_rank: "gold",
      organizer_profile_json: JSON.stringify({ avatarUrl: "https://cdn.example/leader.png" }),
      event_type: "club",
      club_id: "club-bread",
      event_date: "2026-09-20",
      status: "open",
      title: "パン部限定パン屋巡り",
      public_data_json: JSON.stringify({
        image: "/api/event-images/events%2F20%2Fbread.jpg",
        time: "10:00",
        location: "東京都渋谷区の集合場所",
        tabelogUrl: "https://tabelog.com/secret",
        googleMapsUrl: "https://maps.google.com/secret",
        participants: ["IRO0010"],
        privateMemo: "非公開メモ",
      }),
      private_memo: "幹事だけのメモ",
      created_at: "2026-08-22T00:00:00.000Z",
    });

    expect(preview).toMatchObject({
      id: "event-club-1",
      clubId: "club-bread",
      title: "パン部限定パン屋巡り",
      date: "2026-09-20",
      lockedClubEvent: true,
      organizerProfileId: "IRO0020",
      organizerName: "パン部長",
      organizerAvatar: "https://cdn.example/leader.png",
      organizerRank: "gold",
      location: "部員限定",
      participants: [],
      applicantIds: [],
    });
    expect(preview).not.toHaveProperty("tabelogUrl");
    expect(preview).not.toHaveProperty("googleMapsUrl");
    expect(preview).not.toHaveProperty("privateMemo");
  });

  it("has a narrow companion update action that does not require resubmitting legacy event fields", () => {
    const source = readFileSync("sites/events.ts", "utf8");
    expect(source).toContain('input?.action === "update_companions"');
    expect(source).toContain("data.companionIds = companionIds");
    expect(source).toContain("event.companions_edited");
  });

  it("adds event companions to the finalized participant chat without adding them to the confirmed count", () => {
    const source = readFileSync("sites/events.ts", "utf8");
    expect(source).toContain("const companionMemberIds = new Set<number>()");
    expect(source).toContain("const chatMemberIds = new Set");
    expect(source).toContain("companionCount: companionMemberIds.size");
  });
});
