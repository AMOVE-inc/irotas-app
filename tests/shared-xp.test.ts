import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rankFromXp } from "../sites/xp";

describe("shared XP", () => {
  it("uses the agreed rank thresholds", () => {
    expect(rankFromXp(0)).toBe("regular");
    expect(rankFromXp(100)).toBe("silver");
    expect(rankFromXp(500)).toBe("gold");
    expect(rankFromXp(1000)).toBe("platinum");
  });

  it("persists idempotent XP operations in schema 18", () => {
    const migration = fs.readFileSync(path.join(process.cwd(), "drizzle/0017_shared_xp.sql"), "utf8");
    expect(migration).toContain("UNIQUE(member_id, action, source_id)");
    expect(migration).toContain("platform_schema_version");
    expect(migration).toContain("'18'");
  });
});
