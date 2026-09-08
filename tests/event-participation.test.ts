import { describe, expect, it } from "vitest";
import type { Event } from "../constants/mock-data";
import { getEventParticipationStatus, isEventOrganizer, isPastEventDate } from "../lib/event-participation";

const event: Event = { id: "e", title: "会", description: "", date: "2026-08-01", time: "18:00", location: "東京", image: "", capacity: 5, attendees: 3, participants: ["confirmed"], applicantIds: ["confirmed", "applied"], companionIds: ["companion"], price: "5,000円", category: "kanto", eventType: "gourmet", status: "open", createdBy: "host" };

describe("event participation labels", () => {
  it("distinguishes pending applications and confirmed attendance", () => {
    expect(getEventParticipationStatus(event, "applied")).toBe("applied");
    expect(getEventParticipationStatus(event, "confirmed")).toBe("confirmed");
    expect(getEventParticipationStatus(event, "companion")).toBe("confirmed");
    expect(getEventParticipationStatus(event, "other")).toBeNull();
  });

  it("identifies the organizer even before a refreshed event includes the server flag", () => {
    expect(isEventOrganizer(event, "host")).toBe(true);
    expect(isEventOrganizer({ ...event, organizerProfileId: "organizer", isOrganizer: false }, "organizer")).toBe(true);
    expect(isEventOrganizer({ ...event, isOrganizer: true }, "other")).toBe(true);
    expect(isEventOrganizer(event, "other")).toBe(false);
  });

  it("moves events dated before today in Japan into the past history", () => {
    const now = new Date("2026-09-08T00:30:00.000Z"); // 09:30 in Japan
    expect(isPastEventDate({ ...event, date: "2026-09-07" }, now)).toBe(true);
    expect(isPastEventDate({ ...event, date: "2026-09-08" }, now)).toBe(false);
  });
});
