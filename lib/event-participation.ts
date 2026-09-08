import type { Event } from "../constants/mock-data";

export type EventParticipationStatus = "applied" | "confirmed" | null;

/** Prefer the server flag, while identity fields cover the initial event-store render. */
export function isEventOrganizer(event: Event, memberId: string): boolean {
  return event.isOrganizer === true || event.organizerProfileId === memberId || event.createdBy === memberId;
}

export function getEventParticipationStatus(event: Event, memberId: string): EventParticipationStatus {
  if (event.participants.includes(memberId) || event.companionIds?.includes(memberId)) return "confirmed";
  if (event.applicantIds?.includes(memberId)) return "applied";
  return null;
}
