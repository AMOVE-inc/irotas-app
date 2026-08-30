import type { Event } from "../constants/mock-data";
import { PREFECTURE_TO_REGION } from "../constants/event-areas";
import { extractEventLocation } from "./event-location";

export type EventAreaFilter = "all" | "kanto" | "kansai";
export type EventTypeFilter = "all" | Event["eventType"];
export type EventSortOrder = "date" | "newest";
export const DEFAULT_EVENT_SORT_ORDER: EventSortOrder = "date";

export interface EventFilters {
  area: EventAreaFilter;
  eventType: EventTypeFilter;
  openOnly: boolean;
  startDate?: string;
  endDate?: string;
  sortOrder?: EventSortOrder;
  hostedByMemberId?: string;
  participatingMemberId?: string;
  participationStatuses?: ("applied" | "confirmed")[];
  favoriteOnly?: boolean;
  favoriteEventIds?: string[];
  genres?: string[];
  budgetMin?: number;
  budgetMax?: number;
  budgetRanges?: { min?: number; max?: number }[];
  areas?: string[];
  keyword?: string;
  joinedClubOnly?: boolean;
  joinedClubIds?: string[];
}

function eventStart(event: Event): number {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(event.time || "") ? event.time : "00:00";
  const parsed = Date.parse(`${event.date}T${time}:00`);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function dateBoundary(date: string | undefined, endOfDay = false): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = Date.parse(`${date}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(parsed) ? null : parsed;
}

function eventCreatedAt(event: Event): number {
  const parsed = event.createdAt ? Date.parse(event.createdAt) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function priceBounds(event: Event): { min: number; max: number } {
  if (typeof event.priceMin === "number" || typeof event.priceMax === "number") {
    return { min: event.priceMin ?? event.priceMax ?? 0, max: event.priceMax ?? event.priceMin ?? 0 };
  }
  const values = event.price.replace(/,/g, "").match(/\d+/g)?.map(Number) ?? [];
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: values[0], max: values[1] ?? values[0] };
}

/** 未開催は近い順、開催済みはその下へ新しい順で並べる。 */
export function filterAndSortEvents(
  events: Event[],
  filters: EventFilters,
  referenceDate = new Date(),
): Event[] {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()).getTime();
  const startBoundary = dateBoundary(filters.startDate);
  const endBoundary = dateBoundary(filters.endDate, true);

  return events
    .filter((event) => filters.area === "all" || event.category === filters.area || event.category === "all")
    .filter((event) => filters.eventType === "all" || event.eventType === filters.eventType)
    .filter((event) => !filters.joinedClubOnly || (event.eventType === "club" && Boolean(event.clubId && filters.joinedClubIds?.includes(event.clubId))))
    .filter((event) => !filters.openOnly || (event.status === "open" && event.attendees < event.capacity))
    .filter((event) => startBoundary === null || eventStart(event) >= startBoundary)
    .filter((event) => endBoundary === null || eventStart(event) <= endBoundary)
    .filter((event) => !filters.hostedByMemberId || event.isOrganizer === true || event.createdBy === filters.hostedByMemberId)
    .filter((event) => {
      if (filters.participationStatuses?.length) {
        if (event.viewerParticipationStatus !== undefined) {
          const normalized = event.viewerParticipationStatus === "cancel_requested" ? "confirmed" : event.viewerParticipationStatus;
          return normalized !== null && filters.participationStatuses.includes(normalized);
        }
        if (!filters.participatingMemberId) return false;
        const memberId = filters.participatingMemberId;
        const confirmed = event.participants.includes(memberId) || Boolean(event.companionIds?.includes(memberId));
        const applied = Boolean(event.applicantIds?.includes(memberId)) && !confirmed;
        return filters.participationStatuses.some((status) => status === "confirmed" ? confirmed : applied);
      }
      if (!filters.participatingMemberId) return true;
      const memberId = filters.participatingMemberId;
      return event.participants.includes(memberId) || event.applicantIds?.includes(memberId) || event.companionIds?.includes(memberId);
    })
    .filter((event) => !filters.favoriteOnly || Boolean(filters.favoriteEventIds?.includes(event.id)))
    .filter((event) => !filters.genres?.length || filters.genres.some((genre) => event.genres?.includes(genre)))
    .filter((event) => {
      if (!filters.areas?.length) return true;
      const derived = extractEventLocation(event.location);
      const prefecture = event.prefecture ?? derived.prefecture ?? "";
      const tokyoArea = event.tokyoArea ?? derived.tokyoArea;
      return filters.areas.some((area) => {
        if (area.startsWith("tokyo:")) return prefecture === "東京都" && tokyoArea === area.slice(6);
        if (area === "region:kanto-tokyo") return prefecture === "東京都";
        if (area === "region:kanto-other") return prefecture !== "東京都" && PREFECTURE_TO_REGION[prefecture] === "region:kanto";
        if (area === "region:kansai") return PREFECTURE_TO_REGION[prefecture] === "region:kansai" || (!prefecture && event.category === "kansai");
        if (area === "region:other") return Boolean(prefecture) && !["region:kanto", "region:kansai"].includes(PREFECTURE_TO_REGION[prefecture]);
        return false;
      });
    })
    .filter((event) => {
      const keyword = filters.keyword?.trim().toLowerCase();
      if (!keyword) return true;
      return [event.title, event.restaurantName, event.description, event.location, event.prefecture, event.tokyoArea, ...(event.genres ?? [])]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword));
    })
    .filter((event) => {
      if (filters.budgetMin === undefined && filters.budgetMax === undefined) return true;
      const bounds = priceBounds(event);
      return (filters.budgetMin === undefined || bounds.max >= filters.budgetMin) &&
        (filters.budgetMax === undefined || bounds.min <= filters.budgetMax);
    })
    .filter((event) => {
      if (!filters.budgetRanges?.length) return true;
      const bounds = priceBounds(event);
      return filters.budgetRanges.some((range) =>
        (range.min === undefined || bounds.max >= range.min) && (range.max === undefined || bounds.min <= range.max),
      );
    })
    .sort((a, b) => {
      if (filters.sortOrder === "newest") return eventCreatedAt(b) - eventCreatedAt(a);
      const aStart = eventStart(a);
      const bStart = eventStart(b);
      if (!Number.isFinite(aStart)) return Number.isFinite(bStart) ? 1 : 0;
      if (!Number.isFinite(bStart)) return -1;

      const aUpcoming = aStart >= today;
      const bUpcoming = bStart >= today;
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      return aUpcoming ? aStart - bStart : bStart - aStart;
    });
}
