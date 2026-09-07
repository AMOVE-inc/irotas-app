import { describe, expect, it } from "vitest";
import type { Event } from "../constants/mock-data";
import { eventFormSaveFields, eventFormValuesFromEvent, validateEventForm } from "../lib/event-form";

const event: Event = {
  id: "event-1", title: "寿司会", restaurantName: "鮨いろた", description: "詳細", date: "2026-09-20", time: "19:00", location: "東京都渋谷区恵比寿1-1-1", image: "/api/event-images/event-1", capacity: 4, reservationCapacity: 6, attendees: 0, participants: [], companionIds: ["member-2"], price: "8,000円〜10,000円", priceMin: 8000, priceMax: 10000, genres: ["寿司"], category: "kanto", eventType: "gourmet", status: "open", createdBy: "member-1", applicationDeadline: "2026-09-18", cancellationPolicy: "キャンセル規約", selectionMethod: "first_come", tabelogUrl: "https://tabelog.com/example", googleMapsUrl: "https://maps.example.com", publicNotes: "公開メモ", privateMemo: "非公開メモ",
};

describe("event edit form values", () => {
  it("hydrates every persisted creation field from an existing event", () => {
    const form = eventFormValuesFromEvent(event);
    expect(form).toMatchObject({ restaurantName: "鮨いろた", eventName: "寿司会", genres: ["寿司"], companionIds: ["member-2"], budgetMin: "8,000円", budgetMax: "10,000円", fixedAmount: false, decisionDate: "2026-09-18", publicNotes: "公開メモ", privateMemo: "非公開メモ" });
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
    expect(validateEventForm(form, { requireImage: false })).toContain("必須項目");
  });
});
