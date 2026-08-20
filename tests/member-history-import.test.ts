import { describe, expect, it } from "vitest";
import { parseMemberHistoryImport } from "../lib/member-history-import";
import { validateMemberHistoryImport } from "../sites/member-history-import";

describe("member history import", () => {
  const csv = [
    "discord_user_id,participation_count,organizer_count",
    "1228755489446166528,12,2",
    "1228676952316051458,8,0",
  ].join("\n");

  it("parses aggregate counts without relying on display names", () => {
    expect(parseMemberHistoryImport(csv)).toEqual({
      rows: [
        { discordUserId: "1228755489446166528", participationCount: 12, organizerCount: 2 },
        { discordUserId: "1228676952316051458", participationCount: 8, organizerCount: 0 },
      ],
      participationTotal: 20,
      organizerTotal: 2,
    });
  });

  it("requires a precise confirmation phrase on the server", () => {
    const rows = parseMemberHistoryImport(csv).rows;
    expect(validateMemberHistoryImport({ confirmation: "IMPORT_HISTORY_2", rows }).rows).toEqual(rows);
    expect(() => validateMemberHistoryImport({ confirmation: "IMPORT_HISTORY", rows })).toThrow("confirmation_required");
  });

  it("rejects duplicate Discord IDs and invalid counts", () => {
    expect(() => parseMemberHistoryImport([
      "discord_user_id,participation_count,organizer_count",
      "1228755489446166528,1,0",
      "1228755489446166528,2,0",
    ].join("\n"))).toThrow("重複");
    expect(() => validateMemberHistoryImport({
      confirmation: "IMPORT_HISTORY_1",
      rows: [{ discordUserId: "1228755489446166528", participationCount: -1, organizerCount: 0 }],
    })).toThrow("invalid_participation_count");
  });
});

