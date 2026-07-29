import { describe, expect, it } from "vitest";
import type { Event } from "../constants/mock-data";
import { getGoogleCalendarUrl, getOutlookCalendarUrl } from "../lib/calendar-links";

const event = { title: "寿司会", description: "説明", date: "2026-08-10", time: "19:00", location: "東京都中央区" } as Event;

describe("calendar links", () => {
  it("creates Google Calendar URL with event details", () => {
    const url = new URL(getGoogleCalendarUrl(event));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("text")).toBe("寿司会");
    expect(url.searchParams.get("location")).toBe("東京都中央区");
  });

  it("creates Outlook Calendar URL with event details", () => {
    const url = new URL(getOutlookCalendarUrl(event));
    expect(url.hostname).toBe("outlook.live.com");
    expect(url.searchParams.get("subject")).toBe("寿司会");
    expect(url.searchParams.get("startdt")).toContain("2026-08-10");
  });
});
