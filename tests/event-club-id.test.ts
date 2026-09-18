import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalClubId } from "../lib/club-id";

describe("legacy event club IDs", () => {
  it("maps every Discord-era alias to the current app club", () => {
    expect(canonicalClubId("club-stage")).toBe("club-theater");
    expect(canonicalClubId("club-sports-viewing")).toBe("club-sports-watch");
    expect(canonicalClubId("club-cooking")).toBe("club-cooking-class");
    expect(canonicalClubId("club-walk")).toBe("club-walk");
  });

  it("migrates already persisted events", () => {
    const migration = readFileSync("drizzle/0057_normalize_legacy_event_club_ids.sql", "utf8");
    expect(migration).toContain("WHEN 'club-stage' THEN 'club-theater'");
    expect(migration).toContain("WHEN 'club-sports-viewing' THEN 'club-sports-watch'");
    expect(migration).toContain("WHEN 'club-cooking' THEN 'club-cooking-class'");
  });
});
