import { describe, expect, it } from "vitest";
import { buildEventReminderPlans, buildFavoriteDeadlineReminderPlans, buildOrganizerReminderPlans, parseApplicationDeadline } from "../lib/event-reminders";

describe("event reminder plans", () => {
  it("creates seven-day and two-day reminders", () => {
    const plans = buildEventReminderPlans({ date: "2026-08-10", time: "19:00" });
    expect(plans.map((plan) => plan.kind)).toEqual(["seven_days", "two_days"]);
    expect(plans[0].scheduledAt.toISOString()).toContain("2026-08-03");
    expect(plans[1].scheduledAt.toISOString()).toContain("2026-08-08");
  });

  it("parses a date-only application deadline at 9am JST", () => {
    expect(parseApplicationDeadline("2026-08-01")?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("creates organizer reminders for three days, two days, previous day and same day", () => {
    const plans = buildOrganizerReminderPlans({ applicationDeadline: "2026-08-10" });
    expect(plans.map((plan) => plan.kind)).toEqual(["organizer_three_days", "organizer_two_days", "organizer_one_day", "organizer_same_day"]);
    expect(plans.map((plan) => plan.label)).toEqual(["3日前", "2日前", "前日", "当日"]);
    expect(plans[0].scheduledAt.toISOString()).toBe("2026-08-07T00:00:00.000Z");
    expect(plans[3].scheduledAt.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("creates favorite-event deadline reminders three days and one day before", () => {
    const plans = buildFavoriteDeadlineReminderPlans({ applicationDeadline: "2026-08-10" });
    expect(plans.map((plan) => plan.kind)).toEqual(["favorite_three_days", "favorite_one_day"]);
    expect(plans.map((plan) => plan.scheduledAt.toISOString())).toEqual(["2026-08-07T00:00:00.000Z", "2026-08-09T00:00:00.000Z"]);
  });
});
