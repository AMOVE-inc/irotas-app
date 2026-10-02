import type { Event } from "../constants/mock-data";

export type EventImageSource = Pick<Event, "image">;

export function hasEventImageSource(event: EventImageSource): boolean {
  return Boolean(event.image);
}
