import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import metadata from "../data/discord-introduction-member-metadata.json";

describe("Mariko member term correction", () => {
  it("keeps the import source and production correction on term 6", () => {
    expect(metadata["1507605842629890231" as keyof typeof metadata].memberTerm).toBe("第6期メンバー");
    const migration = readFileSync(resolve(process.cwd(), "drizzle/0053_correct_mariko_member_term.sql"), "utf8");
    expect(migration).toContain("public_member_id = 'IRO0336'");
    expect(migration.match(/SET member_term = '第6期'/g)).toHaveLength(2);
  });
});
