import { describe, expect, it } from "vitest";
import { IMPORTED_DISCORD_EVENTS } from "../constants/imported-discord-events";
import { timelineEventIsUpcoming, timelineEventPublishedAt } from "../sites/home-automation";

describe("home event timeline", () => {
  it("uses the original Discord publication date instead of the migration date", () => {
    const event = IMPORTED_DISCORD_EVENTS.find((item) => item.id === "discord-event-1523518652937146431");
    expect(event?.createdAt).toBe("2026-07-06T02:39:12.468000Z");
    expect(timelineEventPublishedAt("2026-09-12T10:00:00.000Z", event?.createdAt)).toBe(event?.createdAt);
    expect(timelineEventPublishedAt("2026-09-12T10:00:00.000Z")).toBe("2026-09-12T10:00:00.000Z");
  });

  it("keeps upcoming events and removes events whose date has passed", () => {
    expect(timelineEventIsUpcoming("2026-08-19", "2026-09-19")).toBe(false);
    expect(timelineEventIsUpcoming("2026-09-19", "2026-09-19")).toBe(true);
    expect(timelineEventIsUpcoming("2026-10-21", "2026-09-19")).toBe(true);
  });
});
