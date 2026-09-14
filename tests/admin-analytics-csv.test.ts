import { describe, expect, it } from "vitest";
import { buildAdminAnalyticsCsv } from "../lib/admin-analytics-csv";
import type { Event } from "../constants/mock-data";

describe("admin analytics CSV", () => {
  it("exports live aggregates and escapes member-supplied event titles", () => {
    const csv = buildAdminAnalyticsCsv({
      totalMembers: 4,
      genderCounts: { male: 2, female: 1, other: 0, unset: 1 },
      rankCounts: { regular: 3, gold: 1 },
      branchCounts: { kanto: 3, kansai: 2 },
      monthlyJoins: { "2026-09": 2 },
    }, [{ title: '=HYPERLINK("https://example.com")', date: "2026-09-13", attendees: 2, capacity: 8 } as Event]);
    expect(csv).toContain('"会員","利用可能会員数","4"');
    expect(csv).toContain('"支部","関東","3"');
    expect(csv).toContain('"イベント","\'=HYPERLINK(""https://example.com"")","2"');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
});
