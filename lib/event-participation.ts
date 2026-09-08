import type { Event } from "../constants/mock-data";

export type EventParticipationStatus = "applied" | "confirmed" | null;

/** Events dated before today in Japan belong in the past-event history. */
export function isPastEventDate(event: Event, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const today = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return event.date < `${today.year}-${today.month}-${today.day}`;
}

/** Prefer the server flag, while identity fields cover the initial event-store render. */
export function isEventOrganizer(event: Event, memberId: string): boolean {
  return event.isOrganizer === true || event.organizerProfileId === memberId || event.createdBy === memberId;
}

export function getEventParticipationStatus(event: Event, memberId: string): EventParticipationStatus {
  // Events returned by the API carry a viewer-specific status.  It is the
  // source of truth while a participant list can be stale during refreshes.
  if (event.viewerMemberId === memberId && event.viewerParticipationStatus) {
    return event.viewerParticipationStatus === "cancel_requested"
      ? "confirmed"
      : event.viewerParticipationStatus;
  }
  if (event.participants.includes(memberId) || event.companionIds?.includes(memberId)) return "confirmed";
  if (event.applicantIds?.includes(memberId)) return "applied";
  return null;
}
