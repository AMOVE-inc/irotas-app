import { describe, expect, it } from "vitest";
import type { Event } from "../constants/mock-data";
import { filterAndSortEvents } from "../lib/event-filters";

const makeEvent = (overrides: Partial<Event>): Event => ({
  id: "event",
  title: "イベント",
  description: "説明",
  date: "2026-08-01",
  time: "18:00",
  location: "東京",
  image: "https://example.com/event.jpg",
  capacity: 10,
  attendees: 0,
  participants: [],
  price: "無料",
  category: "all",
  eventType: "official",
  status: "open",
  createdBy: "admin",
  ...overrides,
});

describe("event list filtering and sorting", () => {
  const events = [
    makeEvent({ id: "late", date: "2026-09-01", eventType: "official" }),
    makeEvent({ id: "gourmet", date: "2026-07-25", category: "kanto", eventType: "gourmet" }),
    makeEvent({ id: "full", date: "2026-07-30", category: "kansai", status: "full" }),
    makeEvent({ id: "early", date: "2026-07-24", time: "12:00", eventType: "official" }),
    makeEvent({ id: "past", date: "2026-07-10", eventType: "official" }),
  ];
  const referenceDate = new Date(2026, 6, 21, 12, 0, 0);

  it("sorts nearest dates first without mutating the source", () => {
    const result = filterAndSortEvents(
      events,
      { area: "all", eventType: "all", openOnly: false },
      referenceDate,
    );
    expect(result.map((event) => event.id)).toEqual(["early", "gourmet", "full", "late", "past"]);
    expect(events[0].id).toBe("late");
  });

  it("shows only open events when requested", () => {
    const result = filterAndSortEvents(events, { area: "all", eventType: "all", openOnly: true }, referenceDate);
    expect(result.some((event) => event.status !== "open")).toBe(false);
    expect(result.every((event) => event.attendees < event.capacity)).toBe(true);
  });

  it("filters official events and gourmet gatherings independently", () => {
    const official = filterAndSortEvents(events, { area: "all", eventType: "official", openOnly: false }, referenceDate);
    const gourmet = filterAndSortEvents(events, { area: "all", eventType: "gourmet", openOnly: false }, referenceDate);
    expect(official.every((event) => event.eventType === "official")).toBe(true);
    expect(gourmet.map((event) => event.id)).toEqual(["gourmet"]);
  });

  it("filters events within the selected period", () => {
    const result = filterAndSortEvents(
      events,
      {
        area: "all",
        eventType: "all",
        openOnly: false,
        startDate: "2026-07-24",
        endDate: "2026-07-30",
      },
      referenceDate,
    );
    expect(result.map((event) => event.id)).toEqual(["early", "gourmet", "full"]);
  });
});
