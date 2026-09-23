import type { Event } from "../constants/mock-data";
import { japanDateKey } from "./japan-date";

export type EventParticipationStatus = "applied" | "confirmed" | null;

/** Events dated before today in Japan belong in the past-event history. */
export function isPastEventDate(event: Event, now = new Date()): boolean {
  return event.date < japanDateKey(now);
}

/** Prefer the server flag, while identity fields cover the initial event-store render. */
export function isEventOrganizer(event: Event, memberId: string): boolean {
  if (event.isOrganizer === true || event.organizerProfileId === memberId) return true;
  // Imported Discord seeds use a generic createdBy placeholder, not the host's
  // verified member ID. The API's viewer-specific isOrganizer flag handles them.
  if (event.id.startsWith("discord-event-") && event.organizerProfileId?.startsWith("discord-")) return false;
  return event.createdBy === memberId;
}

export function getEventParticipationStatus(event: Event, memberId: string): EventParticipationStatus {
  // Discordで確定した参加者はアプリの申込レコードを持たないことがある。
  if (event.recruitmentChannel === "discord" && event.participants.includes(memberId)) return "confirmed";
  // Events returned by the API carry a viewer-specific status.  It is the
  // source of truth while a participant list can be stale during refreshes.
  if (event.viewerParticipationStatus) {
    return event.viewerParticipationStatus === "cancel_requested"
      ? "confirmed"
      : event.viewerParticipationStatus;
  }
  if (event.participants.includes(memberId) || event.companionIds?.includes(memberId)) return "confirmed";
  if (event.applicantIds?.includes(memberId)) return "applied";
  return null;
}

/** Counts only confirmed recruited members; the organizer and companions do not consume recruit slots. */
export function getConfirmedRecruitParticipantCount(event: Event): number {
  const organizerId = event.organizerProfileId ?? event.createdBy;
  const companionIds = new Set(event.companionIds ?? []);
  return [...new Set(event.participants ?? [])]
    .filter((memberId) => memberId !== organizerId && !companionIds.has(memberId)).length;
}

/** Event-card count: remaining recruit slots / restaurant reservation seats. */
export function getEventCapacitySummary(event: Event, confirmedCount = getConfirmedRecruitParticipantCount(event)): string {
  if (event.capacityMode) {
    return `残り${event.capacityMode === "undecided" ? "未定" : "上限なし"}`;
  }
  const recruitCapacity = Math.max(0, event.capacity ?? 0);
  const remaining = Math.max(0, recruitCapacity - confirmedCount);
  const reservationCapacity = event.reservationCapacity && event.reservationCapacity > 0
    ? event.reservationCapacity
    : recruitCapacity + 1;
  return `残り${remaining}名 / 予約${reservationCapacity}名`;
}
