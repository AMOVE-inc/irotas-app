import type { Event } from "@/constants/mock-data";

function compactUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function eventDates(event: Event): { start: Date; end: Date } {
  const start = new Date(`${event.date}T${event.time || "00:00"}:00+09:00`);
  const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
  return { start: safeStart, end: new Date(safeStart.getTime() + 2 * 60 * 60 * 1000) };
}

function calendarFields(event: Event) {
  const { start, end } = eventDates(event);
  return { start, end, title: event.title, description: event.description, location: event.location };
}

export function getGoogleCalendarUrl(event: Event): string {
  const { start, end } = calendarFields(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${compactUtc(start)}/${compactUtc(end)}`,
    details: event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function getGoogleCalendarAppUrl(event: Event): string {
  const [, query = ""] = getGoogleCalendarUrl(event).split("?");
  return `comgooglecalendar://calendar/r/eventedit?${query}`;
}

export function getOutlookCalendarUrl(event: Event): string {
  const { start, end } = calendarFields(event);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: event.description,
    location: event.location,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function getOutlookCalendarAppUrl(event: Event): string {
  const { start, end, title, description, location } = calendarFields(event);
  const params = new URLSearchParams({
    title,
    description,
    location,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
  });
  return `ms-outlook://events/new?${params.toString()}`;
}
