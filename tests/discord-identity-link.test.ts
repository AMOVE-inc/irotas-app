import { describe, expect, it } from "vitest";
import { matchDiscordIdentities, validateDiscordIdentityLink } from "../sites/discord-identity-link";

const row = {
  discordUserId: "123456789012345678",
  discordUsername: "sample_user",
  displayName: "サンプル",
  memberTerm: "第7期",
  birthDates: ["1995-05-17"],
};

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  public_member_id: "IRO-0010",
  display_name: "サンプル",
  member_term: "第7期",
  profile_json: JSON.stringify({ birthDate: "1995-05-17" }),
  ...overrides,
});

describe("Discord identity link from the club form", () => {
  it("validates a confirmed, bounded identity payload", () => {
    expect(validateDiscordIdentityLink({ confirmation: "LINK_SHEET_DISCORD_1", rows: [row] })).toEqual([row]);
  });

  it("matches by name, term and one of the submitted birth dates", () => {
    const result = matchDiscordIdentities([{ ...row, birthDates: ["1995-05-01", "1995-05-17"] }], [candidate()]);
    expect(result.unresolved).toEqual([]);
    expect(result.matched[0]?.method).toBe("name_term_birth_date");
    expect(result.matched[0]?.candidate.id).toBe(10);
  });

  it("uses a unique term and birth-date match when the app display name differs", () => {
    const result = matchDiscordIdentities([row], [candidate({ display_name: "本名" })]);
    expect(result.matched[0]?.method).toBe("term_birth_date");
  });

  it("does not guess when multiple members share the identifying fields", () => {
    const result = matchDiscordIdentities([row], [candidate(), candidate({ id: 11, public_member_id: "IRO-0011" })]);
    expect(result.matched).toHaveLength(0);
    expect(result.unresolved).toEqual([{ discordUsername: "sample_user", reason: "ambiguous", candidateCount: 2 }]);
  });

  it("only falls back to exact name and term when the app has no birth date", () => {
    const missingDate = candidate({ profile_json: "{}" });
    expect(matchDiscordIdentities([row], [missingDate]).matched[0]?.method).toBe("name_term_missing_birth_date");
    expect(matchDiscordIdentities([row], [candidate({ profile_json: JSON.stringify({ birthDate: "2000-01-01" }) })]).matched).toHaveLength(0);
  });

  it("rejects malformed personal-data rows and duplicate Discord IDs", () => {
    expect(() => validateDiscordIdentityLink({ confirmation: "LINK_SHEET_DISCORD_1", rows: [{ ...row, birthDates: [] }] })).toThrow("invalid_birth_dates");
    expect(() => validateDiscordIdentityLink({ confirmation: "LINK_SHEET_DISCORD_2", rows: [row, { ...row, discordUsername: "another" }] })).toThrow("invalid_discord_id");
  });
});
