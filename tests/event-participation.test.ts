import { describe, expect, it } from "vitest";
import type { Event } from "../constants/mock-data";
import { canFinalizeEventParticipants, getConfirmedRecruitParticipantCount, getEventCapacitySummary, getEventParticipationStatus, isEventOrganizer, isPastEventDate } from "../lib/event-participation";

const event: Event = { id: "e", title: "会", description: "", date: "2026-08-01", time: "18:00", location: "東京", image: "", capacity: 5, attendees: 3, participants: ["confirmed"], applicantIds: ["confirmed", "applied"], companionIds: ["companion"], price: "5,000円", category: "kanto", eventType: "gourmet", status: "open", createdBy: "host" };

describe("event participation labels", () => {
  it("distinguishes pending applications and confirmed attendance", () => {
    expect(getEventParticipationStatus(event, "applied")).toBe("applied");
    expect(getEventParticipationStatus(event, "confirmed")).toBe("confirmed");
    expect(getEventParticipationStatus(event, "companion")).toBe("confirmed");
    expect(getEventParticipationStatus(event, "other")).toBeNull();
  });

  it("treats Discord manually confirmed participants as confirmed even without an app application", () => {
    expect(getEventParticipationStatus({ ...event, recruitmentChannel: "discord", viewerParticipationStatus: "applied", participants: ["IRO0001"] }, "IRO0001")).toBe("confirmed");
  });

  it("identifies the organizer even before a refreshed event includes the server flag", () => {
    expect(isEventOrganizer(event, "host")).toBe(true);
    expect(isEventOrganizer({ ...event, organizerProfileId: "organizer", isOrganizer: false }, "organizer")).toBe(true);
    expect(isEventOrganizer({ ...event, isOrganizer: true }, "other")).toBe(true);
    expect(isEventOrganizer(event, "other")).toBe(false);
    expect(isEventOrganizer({ ...event, id: "discord-event-123", createdBy: "u1", organizerProfileId: "discord-123" }, "u1")).toBe(false);
    expect(isEventOrganizer({ ...event, id: "discord-event-123", createdBy: "u1", organizerProfileId: "discord-123", isOrganizer: true }, "IRO0020")).toBe(true);
  });

  it("moves events dated before today in Japan into the past history", () => {
    const now = new Date("2026-09-08T00:30:00.000Z"); // 09:30 in Japan
    expect(isPastEventDate({ ...event, date: "2026-09-07" }, now)).toBe(true);
    expect(isPastEventDate({ ...event, date: "2026-09-08" }, now)).toBe(false);
  });

  it("does not count the organizer or companions against the recruiting capacity", () => {
    expect(getConfirmedRecruitParticipantCount({ ...event, participants: ["host", "confirmed", "companion", "second"], companionIds: ["companion"] })).toBe(2);
  });

  it("shows remaining recruit slots against the restaurant reservation count", () => {
    expect(getEventCapacitySummary({ ...event, capacity: 5, reservationCapacity: 7, participants: ["host", "confirmed", "companion", "second"], companionIds: ["companion"] })).toBe("残り3名 / 予約7名");
  });

  it("allows finalizing at capacity even when unselected applications remain", () => {
    const fullWithPending = { ...event, capacity: 5, participants: ["one", "two", "three", "four", "five"], applicantIds: ["one", "two", "three", "four", "five", "six", "seven"] };
    expect(canFinalizeEventParticipants(fullWithPending)).toBe(true);
    expect(canFinalizeEventParticipants({ ...fullWithPending, participantsFinalizedAt: "2026-10-02T00:00:00.000Z" })).toBe(false);
  });
});
