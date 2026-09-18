import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "drizzle/0056_reconcile_post_snapshot_discord_clubs.sql",
  "utf8",
);

describe("post-snapshot Discord club reconciliation", () => {
  it("links yuka only through the exact app ID, email, and Discord ID", () => {
    expect(migration).toContain("public_member_id = 'IRO0437'");
    expect(migration).toContain("LOWER(TRIM(email)) = '02.ehtnadohr@gmail.com'");
    expect(migration).toContain("'1531839895780458667'");
    expect(migration).toContain("owner.id <> members.id");
  });

  it("restores all club additions observed after the imported snapshot", () => {
    for (const clubId of [
      "club-sports-watch",
      "club-golf",
      "club-travel",
      "club-sweets",
      "club-walk",
      "club-running",
      "club-wine",
      "club-bread",
    ]) {
      expect(migration).toContain(`'${clubId}'`);
    }
  });

  it("re-approves a current Discord role even when an old app row exists", () => {
    expect(migration).toContain("ON CONFLICT(club_id, member_id) DO UPDATE SET");
    expect(migration).toContain("status = 'approved'");
    expect(migration).toContain("source = 'discord'");
  });
});
