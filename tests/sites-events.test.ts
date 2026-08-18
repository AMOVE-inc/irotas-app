import { describe, expect, it } from "vitest";
import { sanitizeEvent } from "../sites/events";

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
});
