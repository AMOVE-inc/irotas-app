import { describe, expect, it } from "vitest";
import type { Event } from "../constants/mock-data";
import { eventFormSaveFields, eventFormValuesFromEvent, hasOnlyCompanionChanges, minimumReservationCapacity, validateEventForm } from "../lib/event-form";

const event: Event = {
  id: "event-1", title: "寿司会", restaurantName: "鮨いろた", description: "詳細", date: "2026-09-20", time: "19:00", location: "東京都渋谷区恵比寿1-1-1", image: "/api/event-images/event-1", capacity: 4, reservationCapacity: 6, attendees: 0, participants: [], companionIds: ["member-2"], price: "8,000円〜10,000円", priceMin: 8000, priceMax: 10000, genres: ["寿司"], category: "kanto", eventType: "gourmet", status: "open", createdBy: "member-1", applicationDeadline: "2026-09-18", cancellationPolicy: "キャンセル規約", selectionMethod: "first_come", tabelogUrl: "https://tabelog.com/example", googleMapsUrl: "https://maps.example.com", publicNotes: "公開メモ", privateMemo: "非公開メモ",
};

describe("event edit form values", () => {
  it("hydrates every persisted creation field from an existing event", () => {
    const form = eventFormValuesFromEvent(event);
    expect(form).toMatchObject({ restaurantName: "鮨いろた", eventName: "寿司会", genres: ["寿司"], companionIds: ["member-2"], budgetMin: "8,000円", budgetMax: "10,000円", fixedAmount: false, decisionDate: "2026-09-18", publicNotes: "公開メモ", privateMemo: "非公開メモ" });
  });

  it("recovers a full address from imported event details when location only has the venue", () => {
    const form = eventFormValuesFromEvent({
      ...event,
      location: "森のブッチャーズ",
      description: "開催場所：森のブッチャーズ\n東京都千代田区一ツ橋2-6-5\n参加をお待ちしています",
    });
    expect(form.address).toBe("東京都千代田区一ツ橋2-6-5");
  });

  it("serializes an edited genre and related search metadata in the same event format", () => {
    const form = eventFormValuesFromEvent(event);
    form.genres = ["イタリアン"];
    form.address = "東京都港区六本木1-1-1";
    const saved = eventFormSaveFields(form);
    expect(saved).toMatchObject({ genres: ["イタリアン"], prefecture: "東京都", tokyoArea: "roppongi-azabu", priceMin: 8000, priceMax: 10000, price: "8,000円〜10,000円" });
  });

  it("rejects an unselected gourmet genre but accepts an existing saved genre", () => {
    const form = eventFormValuesFromEvent(event);
    expect(validateEventForm(form, { requireImage: false })).toBeNull();
    form.genres = [];
    expect(validateEventForm(form, { requireImage: false })).toContain("グルメジャンル");
    expect(validateEventForm(form, { requireImage: false, allowEmptyGenres: true })).toBeNull();
  });

  it("calculates a reservation capacity that includes the organizer and companions", () => {
    expect(minimumReservationCapacity("3", ["member-2"])).toBe(5);
  });

  it("recognizes a companion-only edit so it can avoid revalidating legacy fields", () => {
    const before = eventFormValuesFromEvent(event);
    const after = { ...before, companionIds: ["member-2", "member-3"] };
    expect(hasOnlyCompanionChanges(before, after)).toBe(true);
    expect(hasOnlyCompanionChanges(before, { ...after, publicNotes: "変更" })).toBe(false);
  });

  it("accepts rank pricing without a separate participation fee and derives its range", () => {
    const form = eventFormValuesFromEvent({ ...event, eventType: "official" });
    form.useRankPrices = true;
    form.fixedAmount = false;
    form.budgetMin = "";
    form.budgetMax = "";
    form.rankPrices = { regular: "14,000円", silver: "13,000円", gold: "12,000円", platinum: "11,000円" };
    expect(validateEventForm(form, { requireImage: false })).toBeNull();
    expect(eventFormSaveFields(form)).toMatchObject({ price: "11,000円〜14,000円", priceMin: 11000, priceMax: 14000 });
  });

  it("round-trips an undecided budget", () => {
    const form = eventFormValuesFromEvent(event);
    form.fixedAmount = false;
    form.budgetMin = "未定";
    form.budgetMax = "未定";
    expect(validateEventForm(form, { requireImage: false })).toBeNull();
    const saved = eventFormSaveFields(form);
    expect(saved).toMatchObject({ price: "未定", priceMin: 0, priceMax: 0 });
    expect(eventFormValuesFromEvent({ ...event, ...saved }).budgetMin).toBe("未定");
  });
});
