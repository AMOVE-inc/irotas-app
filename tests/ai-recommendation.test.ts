import { describe, expect, it } from "vitest";
import type { Event } from "../constants/mock-data";
import { createDefaultPreferences, DEFAULT_AI_CONSENTS, validatePreferences } from "../lib/ai-data-store";
import { recommendEvents } from "../lib/event-recommendation";

const event: Event = {
  id: "recommended", title: "銀座の鮨会", restaurantName: "鮨 IRO", description: "", date: "2026-09-20", time: "18:30", location: "東京都中央区銀座", prefecture: "東京都", image: "", capacity: 6, attendees: 1, participants: [], price: "¥8,000", priceMin: 8000, priceMax: 8000, genres: ["寿司"], category: "kanto", eventType: "gourmet", status: "open", createdBy: "u2",
};

describe("AI recommendation MVP", () => {
  it("keeps every independent AI consent off by default", () => {
    expect(DEFAULT_AI_CONSENTS).toMatchObject({ eventRecommendation: false, memberMatching: false, conciergeHistory: false, anonymousImprovement: false });
  });

  it("scores matching cuisine, area, budget, time and group size", () => {
    const preferences = createDefaultPreferences();
    preferences.favoriteCuisineKeys = ["sushi"]; preferences.preferredAreas = ["tokyo"];
    preferences.budgetMaxYen = 10000;
    preferences.availableDayTypes = ["sunday_holiday"];
    preferences.availableTimeSlots = ["dinner"];
    preferences.preferredGroupSizes = ["small"];
    const [result] = recommendEvents([event], preferences, "u1", new Date("2026-08-17T00:00:00+09:00"));
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.reasons).toContain("好きな料理ジャンル");
    expect(result.reasons).toContain("参加しやすい日時");
  });

  it("excludes applied, full and past events", () => {
    expect(recommendEvents([{ ...event, applicantIds: ["u1"] }, { ...event, id: "full", status: "full" }, { ...event, id: "past", date: "2026-01-01" }], createDefaultPreferences(), "u1", new Date("2026-08-17T00:00:00+09:00"))).toEqual([]);
  });

  it("validates MVP input limits", () => {
    const preferences = createDefaultPreferences(); preferences.preferredAreas = ["1", "2", "3", "4", "5", "6"];
    expect(validatePreferences(preferences)).toContain("5個まで");
  });
});
