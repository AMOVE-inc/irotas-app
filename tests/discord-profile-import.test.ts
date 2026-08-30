import { describe, expect, it } from "vitest";
import { validateDiscordProfileImport } from "../sites/discord-profile-import";

describe("Discord profile import", () => {
  const row = {
    discordUserId: "1228755489446166528",
    displayName: "会員",
    avatarUrl: "https://cdn.discordapp.com/avatars/1228755489446166528/example.png",
    bio: "自己紹介",
    discordJoinedAt: "2025-05-01T00:00:00Z",
    discordRoles: ["🥈SILVER", "第7期"],
    memberTerm: "第7期",
    memberRank: "silver",
  };

  it("accepts an exact confirmed Discord-ID update", () => {
    expect(validateDiscordProfileImport({ confirmation: "IMPORT_DISCORD_PROFILES_1", rows: [row] })).toEqual([row]);
  });

  it("rejects duplicate IDs and non-Discord avatar hosts", () => {
    expect(() => validateDiscordProfileImport({ confirmation: "IMPORT_DISCORD_PROFILES_2", rows: [row, row] })).toThrow("invalid_discord_id");
    expect(validateDiscordProfileImport({ confirmation: "IMPORT_DISCORD_PROFILES_1", rows: [{ ...row, avatarUrl: "https://example.com/avatar.png" }] })[0].avatarUrl).toBe("");
  });
});
