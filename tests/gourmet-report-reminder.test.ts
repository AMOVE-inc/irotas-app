import { describe, expect, it } from "vitest";
import type { Event } from "../constants/mock-data";
import { eligibleGourmetReportEvents, gourmetReportReminderKey } from "../lib/gourmet-report-reminder";

const now = new Date("2026-09-20T03:00:00Z");
const event = (id: string, changes: Partial<Event> = {}): Event => ({
  id, title: id, date: "2026-09-19", eventType: "gourmet", participants: ["member-1"],
  ...changes,
} as Event);

describe("gourmet report reminder", () => {
  it("prompts confirmed gourmet attendees and participating organizers only after the event day", () => {
    const events = [
      event("attendee"),
      event("organizer", { participants: [], isOrganizer: true, organizerParticipates: true }),
      event("not-participating-organizer", { participants: [], isOrganizer: true, organizerParticipates: false }),
      event("applicant", { participants: [], viewerParticipationStatus: "applied" }),
      event("today", { date: "2026-09-20" }),
      event("old", { date: "2026-09-12" }),
      event("cancelled", { isCancelled: true }),
      event("official", { eventType: "official" }),
      event("club", { eventType: "club" }),
    ];
    expect(eligibleGourmetReportEvents(events, "member-1", now).map(({ id }) => id)).toEqual(["attendee", "organizer"]);
  });

  it("scopes completion to a member and event", () => {
    expect(gourmetReportReminderKey("member-1", "event-1")).not.toBe(gourmetReportReminderKey("member-2", "event-1"));
  });

  it("prompts a confirmed participant of a Discord-migrated gourmet event", () => {
    const migrated = event("discord-event-1", { recruitmentChannel: "discord", participants: ["member-1"] });
    expect(eligibleGourmetReportEvents([migrated], "member-1", now)).toEqual([migrated]);
  });
});
