import { describe, expect, it } from "vitest";
import { clubLeaderBadgeForClub } from "../lib/club-leader-badges";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("event list club labels and leader badges", () => {
  it("derives every leader badge from the current club name", () => {
    expect(clubLeaderBadgeForClub("散歩部")).toBe("🚶散歩部長");
    expect(clubLeaderBadgeForClub("舞台鑑賞部")).toBe("🎭舞台鑑賞部長");
    expect(clubLeaderBadgeForClub("新設部")).toBe("新設部長");
  });

  it("uses API club metadata for locked labels and organizer leader badges", () => {
    const source = readFileSync(resolve(process.cwd(), "app/(tabs)/events.tsx"), "utf8");
    expect(source).toContain("clubName={item.clubName ??");
    expect(source).toContain("item.organizerLeaderClubNames");
    expect(source).toContain("<MemberClubLeaderBadges labels={organizerLeaderLabels}");
  });

  it("reconciles all verified imported organizers before listing events", () => {
    const source = readFileSync(resolve(process.cwd(), "sites/events.ts"), "utf8");
    expect(source).toContain("await reconcileAllImportedOrganizers(env.DB)");
    expect(source).toContain("event_club.name AS club_name");
    expect(source).toContain("organizer_leader_club_names_json");
  });
});
