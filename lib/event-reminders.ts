import type { Event } from "@/constants/mock-data";

export type EventReminderPlan = { kind: "seven_days" | "two_days"; scheduledAt: Date };

export function buildEventReminderPlans(event: Pick<Event, "date" | "time">): EventReminderPlan[] {
  const start = new Date(`${event.date}T${event.time || "00:00"}:00+09:00`);
  if (Number.isNaN(start.getTime())) return [];
  return [
    { kind: "seven_days", scheduledAt: new Date(start.getTime() - 7 * 86400000) },
    { kind: "two_days", scheduledAt: new Date(start.getTime() - 2 * 86400000) },
  ];
}

export function parseApplicationDeadline(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T09:00:00+09:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
