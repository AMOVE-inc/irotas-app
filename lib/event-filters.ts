import type { Event } from "@/constants/mock-data";

export type EventAreaFilter = "all" | "kanto" | "kansai";
export type EventTypeFilter = "all" | Event["eventType"];

export interface EventFilters {
  area: EventAreaFilter;
  eventType: EventTypeFilter;
  openOnly: boolean;
  startDate?: string;
  endDate?: string;
}

function eventStart(event: Event): number {
  const parsed = Date.parse(`${event.date}T${event.time || "00:00"}:00`);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function dateBoundary(date: string | undefined, endOfDay = false): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = Date.parse(`${date}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Show upcoming events first (nearest date first), followed by past events (newest first). */
export function filterAndSortEvents(
  events: Event[],
  filters: EventFilters,
  referenceDate = new Date(),
): Event[] {
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  ).getTime();
  const startBoundary = dateBoundary(filters.startDate);
  const endBoundary = dateBoundary(filters.endDate, true);

  return events
    .filter((event) => filters.area === "all" || event.category === filters.area || event.category === "all")
    .filter((event) => filters.eventType === "all" || event.eventType === filters.eventType)
    .filter((event) => !filters.openOnly || (event.status === "open" && event.attendees < event.capacity))
    .filter((event) => startBoundary === null || eventStart(event) >= startBoundary)
    .filter((event) => endBoundary === null || eventStart(event) <= endBoundary)
    .sort((a, b) => {
      const aStart = eventStart(a);
      const bStart = eventStart(b);
      if (!Number.isFinite(aStart)) return Number.isFinite(bStart) ? 1 : 0;
      if (!Number.isFinite(bStart)) return -1;

      const aIsUpcoming = aStart >= today;
      const bIsUpcoming = bStart >= today;
      if (aIsUpcoming !== bIsUpcoming) return aIsUpcoming ? -1 : 1;
      return aIsUpcoming ? aStart - bStart : bStart - aStart;
    });
}
