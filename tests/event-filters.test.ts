import { describe, expect, it } from "vitest";
import type { Event } from "../constants/mock-data";
import { DEFAULT_EVENT_SORT_ORDER, filterAndSortEvents } from "../lib/event-filters";

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

  it("uses event date as the default sort order", () => {
    expect(DEFAULT_EVENT_SORT_ORDER).toBe("date");
  });

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

  it("can sort by newest registration date", () => {
    const result = filterAndSortEvents([
      makeEvent({ id: "old", createdAt: "2026-07-01T10:00:00+09:00" }),
      makeEvent({ id: "new", createdAt: "2026-07-20T10:00:00+09:00" }),
    ], { area: "all", eventType: "all", openOnly: false, sortOrder: "newest" }, referenceDate);
    expect(result.map((event) => event.id)).toEqual(["new", "old"]);
  });

  it("filters gourmet events where the member is organizer or participant", () => {
    const gourmetEvents = [
      makeEvent({ id: "host", eventType: "gourmet", createdBy: "u1" }),
      makeEvent({ id: "join", eventType: "gourmet", createdBy: "u2", applicantIds: ["u1"] }),
      makeEvent({ id: "other", eventType: "gourmet", createdBy: "u2" }),
    ];
    expect(filterAndSortEvents(gourmetEvents, { area: "all", eventType: "gourmet", openOnly: false, hostedByMemberId: "u1" }, referenceDate).map((event) => event.id)).toEqual(["host"]);
    expect(filterAndSortEvents(gourmetEvents, { area: "all", eventType: "gourmet", openOnly: false, participatingMemberId: "u1" }, referenceDate).map((event) => event.id)).toEqual(["join"]);
  });

  it("filters hosted events across official and gourmet lists", () => {
    const hostedEvents = [
      makeEvent({ id: "official-host", eventType: "official", createdBy: "u1" }),
      makeEvent({ id: "gourmet-host", eventType: "gourmet", createdBy: "u1" }),
      makeEvent({ id: "other", eventType: "official", createdBy: "u2" }),
    ];
    expect(filterAndSortEvents(hostedEvents, { area: "all", eventType: "all", openOnly: false, hostedByMemberId: "u1" }, referenceDate).map((event) => event.id)).toEqual(["official-host", "gourmet-host"]);
  });

  it("separates applied and confirmed participation and supports favorites", () => {
    const memberEvents = [
      makeEvent({ id: "applied", applicantIds: ["u1"] }),
      makeEvent({ id: "confirmed", participants: ["u1"], applicantIds: ["u1"] }),
      makeEvent({ id: "other" }),
    ];
    expect(filterAndSortEvents(memberEvents, { area: "all", eventType: "all", openOnly: false, participatingMemberId: "u1", participationStatuses: ["applied"] }, referenceDate).map((event) => event.id)).toEqual(["applied"]);
    expect(filterAndSortEvents(memberEvents, { area: "all", eventType: "all", openOnly: false, participatingMemberId: "u1", participationStatuses: ["confirmed"] }, referenceDate).map((event) => event.id)).toEqual(["confirmed"]);
    expect(filterAndSortEvents(memberEvents, { area: "all", eventType: "all", openOnly: false, favoriteOnly: true, favoriteEventIds: ["other"] }, referenceDate).map((event) => event.id)).toEqual(["other"]);
  });

  it("filters by any selected genre and overlapping budget", () => {
    const gourmetEvents = [
      makeEvent({ id: "sushi", genres: ["寿司"], priceMin: 8000, priceMax: 12000 }),
      makeEvent({ id: "yakiniku", genres: ["焼肉"], priceMin: 7000, priceMax: 9000 }),
      makeEvent({ id: "italian", genres: ["イタリアン"], priceMin: 3000, priceMax: 5000 }),
    ];
    const result = filterAndSortEvents(gourmetEvents, { area: "all", eventType: "all", openOnly: false, genres: ["寿司", "焼肉"], budgetMin: 5000, budgetMax: 10000 }, referenceDate);
    expect(result.map((event) => event.id)).toEqual(["sushi", "yakiniku"]);
  });

  it("matches any of multiple selected budget ranges", () => {
    const pricedEvents = [
      makeEvent({ id: "casual", priceMin: 2000, priceMax: 3000 }),
      makeEvent({ id: "middle", priceMin: 7000, priceMax: 9000 }),
      makeEvent({ id: "premium", priceMin: 25000, priceMax: 30000 }),
    ];
    const result = filterAndSortEvents(pricedEvents, {
      area: "all",
      eventType: "all",
      openOnly: false,
      budgetRanges: [{ max: 3000 }, { min: 20000 }],
    }, referenceDate);
    expect(result.map((event) => event.id)).toEqual(["casual", "premium"]);
  });

  it("filters by region or prefecture and supports keyword search", () => {
    const localEvents = [
      makeEvent({ id: "tokyo", title: "銀座の寿司会", prefecture: "東京都", location: "東京都中央区", genres: ["寿司"] }),
      makeEvent({ id: "osaka", title: "大阪の焼肉会", prefecture: "大阪府", location: "大阪府大阪市", genres: ["焼肉"] }),
      makeEvent({ id: "aichi", title: "名古屋のひつまぶし会", prefecture: "愛知県", location: "愛知県名古屋市", genres: ["和食"] }),
    ];
    const areaResult = filterAndSortEvents(localEvents, {
      area: "all",
      eventType: "all",
      openOnly: false,
      areas: ["region:kanto"],
    }, referenceDate);
    expect(areaResult.map((event) => event.id)).toEqual(["tokyo"]);

    const keywordResult = filterAndSortEvents(localEvents, {
      area: "all",
      eventType: "all",
      openOnly: false,
      areas: ["pref:大阪府"],
      keyword: "焼肉",
    }, referenceDate);
    expect(keywordResult.map((event) => event.id)).toEqual(["osaka"]);

    const otherRegionResult = filterAndSortEvents(localEvents, {
      area: "all",
      eventType: "all",
      openOnly: false,
      areas: ["region:other"],
    }, referenceDate);
    expect(otherRegionResult.map((event) => event.id)).toEqual(["aichi"]);
  });
});
