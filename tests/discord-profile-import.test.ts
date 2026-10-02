import { describe, expect, it } from "vitest";
import { billingIdentityAllowsDiscordReservation, discordIntroductionDisplayName, explicitMemberTermFromBio, validateDiscordProfileImport } from "../sites/discord-profile-import";

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
    expect(validateDiscordProfileImport({ confirmation: "IMPORT_DISCORD_PROFILES_1", rows: [row] })).toEqual([
      { ...row, hasProfileBio: false },
    ]);
  });

  it("rejects duplicate IDs and non-Discord avatar hosts", () => {
    expect(() => validateDiscordProfileImport({ confirmation: "IMPORT_DISCORD_PROFILES_2", rows: [row, row] })).toThrow("invalid_discord_id");
    expect(validateDiscordProfileImport({ confirmation: "IMPORT_DISCORD_PROFILES_1", rows: [{ ...row, avatarUrl: "https://example.com/avatar.png" }] })[0].avatarUrl).toBe("");
  });

  it("prefers an explicit self-introduction term over a stale Discord term role", () => {
    const bio = "こんばんは！6期のまりこです😌\nよろしくお願いします。";
    expect(explicitMemberTermFromBio(bio)).toBe("第6期");
    expect(validateDiscordProfileImport({ confirmation: "IMPORT_DISCORD_PROFILES_1", rows: [{ ...row, bio, hasProfileBio: true }] })[0].memberTerm).toBe("第6期");
  });

  it("uses the name entered in a Discord self-introduction for an explicitly linked member", () => {
    expect(discordIntroductionDisplayName("名前：たつや\n年齢：31", "長い夜")).toBe("たつや");
    expect(discordIntroductionDisplayName("自己紹介です", " たつや ")).toBe("たつや");
  });

  it("reserves a verified Discord identity only for an active or unexpired grace billing identity", () => {
    const base = { member_id: null, square_status: "ACTIVE", billing_status: null, access_status: "active", grace_until_date: null };
    expect(billingIdentityAllowsDiscordReservation(base, new Date("2026-10-02T00:00:00Z"))).toBe(true);
    expect(billingIdentityAllowsDiscordReservation({ ...base, square_status: "PAUSED" })).toBe(false);
    expect(billingIdentityAllowsDiscordReservation({ ...base, billing_status: "OVERDUE_BLOCKED" })).toBe(false);
    expect(billingIdentityAllowsDiscordReservation({ ...base, access_status: "grace", grace_until_date: "2026-10-02" }, new Date("2026-10-02T12:00:00Z"))).toBe(true);
    expect(billingIdentityAllowsDiscordReservation({ ...base, access_status: "grace", grace_until_date: "2026-10-01" }, new Date("2026-10-02T12:00:00Z"))).toBe(false);
  });
});
