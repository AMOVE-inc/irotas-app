import type { Event } from "../constants/mock-data";
import { getEventParticipationStatus, isEventOrganizer } from "./event-participation";
import { japanDateKey } from "./japan-date";

const DISMISSED_KEY_PREFIX = "irotas_gourmet_report_reminder_dismissed";
export const gourmetReportReminderKey = (memberId: string, eventId: string) => `${DISMISSED_KEY_PREFIX}:${memberId}:${eventId}`;

/** Ask recent gourmet attendees after the event day, including Discord-migrated events. */
export function eligibleGourmetReportEvents(events: readonly Event[], memberId: string, now = new Date()): Event[] {
  const today = japanDateKey(now);
  const oldest = japanDateKey(new Date(now.getTime() - 7 * 24 * 60 * 60_000));
  return events.filter((event) =>
    event.eventType === "gourmet" && !event.isCancelled && event.date < today && event.date >= oldest &&
    (getEventParticipationStatus(event, memberId) === "confirmed" ||
      (isEventOrganizer(event, memberId) && event.organizerParticipates !== false)),
  ).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
