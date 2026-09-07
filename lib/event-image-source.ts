import type { Event } from "../constants/mock-data";

export type EventImageSource = Pick<Event, "image" | "tabelogUrl" | "googleMapsUrl" | "title" | "restaurantName" | "location">;

/** Only request a preview when an event includes a source page to preview. */
export function getEventPreviewUrl(event: EventImageSource): string {
  return event.tabelogUrl || event.googleMapsUrl || "";
}

export function hasEventImageSource(event: EventImageSource): boolean {
  return Boolean(event.image || getEventPreviewUrl(event));
}

export function getEventImageQuery(event: EventImageSource): string {
  return [event.restaurantName, event.title, event.location].filter(Boolean).join(" ");
}
