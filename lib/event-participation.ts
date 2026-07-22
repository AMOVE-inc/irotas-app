import type { Event } from "../constants/mock-data";

export type EventParticipationStatus = "applied" | "confirmed" | null;

export function getEventParticipationStatus(event: Event, memberId: string): EventParticipationStatus {
  if (event.participants.includes(memberId) || event.companionIds?.includes(memberId)) return "confirmed";
  if (event.applicantIds?.includes(memberId)) return "applied";
  return null;
}
