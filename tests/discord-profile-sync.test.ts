import { describe, expect, it } from "vitest";
import { syncStoredDiscordProfiles } from "../sites/discord-profile-sync";

describe("stored Discord profile sync", () => {
  it("overwrites a provisional name after an explicit identity link", () => {
    let sql = "";
    let values: unknown[] = [];
    const db = {
      prepare(query: string) {
        sql = query;
        return { bind: (...input: unknown[]) => { values = input; return { run: async () => ({}) }; } };
      },
    };
    syncStoredDiscordProfiles(db as never, "2026-09-18T00:00:00.000Z", ["849569111679565824"], { overwriteDisplayName: true });
    expect(sql).toContain("display_name = CASE WHEN ? = 1");
    expect(values).toEqual([1, "2026-09-18T00:00:00.000Z", "849569111679565824"]);
  });

  it("preserves an app-authored name during routine imports", () => {
    let values: unknown[] = [];
    const db = { prepare: () => ({ bind: (...input: unknown[]) => { values = input; return { run: async () => ({}) }; } }) };
    syncStoredDiscordProfiles(db as never, "2026-09-18T00:00:00.000Z", ["123456789012345678"]);
    expect(values[0]).toBe(0);
  });
});
