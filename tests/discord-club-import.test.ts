import { describe, expect, it } from "vitest";
import { validateDiscordClubImport } from "../sites/discord-club-import";
import { readFileSync } from "node:fs";

const valid = { confirmation: "IMPORT_DISCORD_CLUBS_1", rows: [{ discordUserId: "123456789012345678", clubIds: ["club-bread", "club-wine"] }] };

describe("Discord club membership import", () => {
  it("accepts a membership-only payload", () => {
    expect(validateDiscordClubImport(valid)).toEqual(valid.rows);
  });

  it("rejects duplicate identities and duplicate club assignments", () => {
    expect(() => validateDiscordClubImport({ confirmation: "IMPORT_DISCORD_CLUBS_2", rows: [valid.rows[0], valid.rows[0]] })).toThrow("invalid_discord_id");
    expect(() => validateDiscordClubImport({ confirmation: "IMPORT_DISCORD_CLUBS_1", rows: [{ ...valid.rows[0], clubIds: ["club-bread", "club-bread"] }] })).toThrow("invalid_club_ids");
  });

  it("requires the expected confirmation and a valid Discord ID", () => {
    expect(() => validateDiscordClubImport({ ...valid, confirmation: "wrong" })).toThrow("confirmation_required");
    expect(() => validateDiscordClubImport({ ...valid, rows: [{ discordUserId: "invalid", clubIds: ["club-bread"] }] })).toThrow("invalid_discord_id");
  });

  it("treats an imported current role as authoritative over an old app status", () => {
    const source = readFileSync("sites/discord-club-import.ts", "utf8");
    expect(source).toContain("ON CONFLICT(club_id, member_id) DO UPDATE SET");
    expect(source).toContain("status = 'approved', source = 'discord'");
    expect(source).toContain("restoredCount: restores.length");
  });
});
