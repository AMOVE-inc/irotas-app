import { describe, expect, it } from "vitest";
import { buildEventReminderPlans, parseApplicationDeadline } from "../lib/event-reminders";

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
});
