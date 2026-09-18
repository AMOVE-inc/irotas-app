import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "drizzle/0055_verified_ryuji_identity.sql",
  "utf8",
);

describe("verified ryuji Discord identity migration", () => {
  it("links the exact billing email and protects existing Discord ownership", () => {
    expect(migration).toContain("LOWER(TRIM(email)) = 'nonerows@gmail.com'");
    expect(migration).toContain("'759084159632277536'");
    expect(migration).toContain("owner.id <> members.id");
  });

  it("restores the current Discord term and four club memberships", () => {
    expect(migration).toContain("'第7期'");
    for (const clubId of [
      "club-walk",
      "club-wine",
      "club-day-drinking",
      "club-meat",
    ]) {
      expect(migration).toContain(`'${clubId}'`);
    }
  });
});
