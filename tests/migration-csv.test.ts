import { describe, expect, it } from "vitest";
import { parseCsv, validateMigrationCsv } from "../lib/migration-csv";

describe("migration CSV", () => {
  it("parses quoted commas and Japanese names", () => {
    const rows = parseCsv('discord_user_id,discord_name,billing_email\n123,"近藤, かのん",USER@example.com');
    expect(rows[0]).toEqual({ discord_user_id: "123", discord_name: "近藤, かのん", billing_email: "USER@example.com" });
  });

  it("reports missing identity columns", () => {
    expect(validateMigrationCsv("members", "name,email\na,b@example.com").missing).toEqual(["discord_user_id", "discord_name", "billing_email"]);
  });
});
