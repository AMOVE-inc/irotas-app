import type { Event } from "@/constants/mock-data";

export type EventReminderPlan = { kind: "seven_days" | "two_days"; scheduledAt: Date };
export type OrganizerReminderPlan = { kind: "organizer_three_days" | "organizer_two_days" | "organizer_one_day" | "organizer_same_day"; scheduledAt: Date; label: string };
export type FavoriteDeadlineReminderPlan = { kind: "favorite_three_days" | "favorite_one_day"; scheduledAt: Date; label: string };

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

export function buildOrganizerReminderPlans(event: Pick<Event, "applicationDeadline">): OrganizerReminderPlan[] {
  const deadline = parseApplicationDeadline(event.applicationDeadline);
  if (!deadline) return [];
  const offsets: Array<{ kind: OrganizerReminderPlan["kind"]; days: number; label: string }> = [
    { kind: "organizer_three_days", days: 3, label: "3日前" },
    { kind: "organizer_two_days", days: 2, label: "2日前" },
    { kind: "organizer_one_day", days: 1, label: "前日" },
    { kind: "organizer_same_day", days: 0, label: "当日" },
  ];
  return offsets.map(({ kind, days, label }) => ({ kind, label, scheduledAt: new Date(deadline.getTime() - days * 86400000) }));
}

export function buildFavoriteDeadlineReminderPlans(event: Pick<Event, "applicationDeadline">): FavoriteDeadlineReminderPlan[] {
  const deadline = parseApplicationDeadline(event.applicationDeadline);
  if (!deadline) return [];
  return [
    { kind: "favorite_three_days", label: "3日前", scheduledAt: new Date(deadline.getTime() - 3 * 86400000) },
    { kind: "favorite_one_day", label: "前日", scheduledAt: new Date(deadline.getTime() - 86400000) },
  ];
}
