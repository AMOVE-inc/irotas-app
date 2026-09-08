import { describe, expect, it } from "vitest";
import { getEventParticipationStatus } from "../lib/event-participation";
import type { Event } from "../constants/mock-data";

const event = (overrides: Partial<Event> = {}): Event => ({
  id: "event-1", title: "イベント", description: "", date: "2026-09-10", time: "19:00", location: "東京",
  image: "", capacity: 2, attendees: 1, participants: [], price: "", category: "all", eventType: "gourmet",
  status: "open", createdBy: "IRO0001", ...overrides,
});

describe("event participation status", () => {
  it("uses the API viewer status before a stale participant list", () => {
    expect(getEventParticipationStatus(event({ viewerMemberId: "IRO0002", viewerParticipationStatus: "confirmed" }), "IRO0002")).toBe("confirmed");
  });

  it("keeps a cancel request in the confirmed presentation state", () => {
    expect(getEventParticipationStatus(event({ viewerMemberId: "IRO0002", viewerParticipationStatus: "cancel_requested" }), "IRO0002")).toBe("confirmed");
  });
});
