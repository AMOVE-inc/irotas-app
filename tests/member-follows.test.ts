import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("member follow persistence", () => {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0013_member_follows.sql"), "utf8");

  it("stores directed follows without allowing self follows", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS member_follows");
    expect(migration).toContain("PRIMARY KEY(follower_member_id, followed_member_id)");
    expect(migration).toContain("CHECK(follower_member_id <> followed_member_id)");
  });

  it("advances the platform schema version", () => {
    expect(migration).toContain("SET value = '14'");
  });
});
