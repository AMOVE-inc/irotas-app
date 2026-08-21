import { describe, expect, it } from "vitest";
import { canMemberAccessClub } from "../sites/clubs";
import type { D1Database, D1PreparedStatement } from "../sites/platform-types";

function accessDatabase(allowed: boolean): D1Database {
  return {
    prepare() {
      const statement: D1PreparedStatement = {
        bind() { return statement; },
        async first<T>() { return (allowed ? { allowed: 1 } : null) as T | null; },
        async run() { return { success: true }; },
        async all() { return { success: true, results: [] }; },
      };
      return statement;
    },
    async batch() { return []; },
  };
}

describe("club access enforcement", () => {
  it("allows approved members or the assigned leader", async () => {
    await expect(canMemberAccessClub(accessDatabase(true), "club-wine", 42)).resolves.toBe(true);
  });

  it("blocks non-members and allows administrator moderation", async () => {
    await expect(canMemberAccessClub(accessDatabase(false), "club-wine", 42)).resolves.toBe(false);
    await expect(canMemberAccessClub(accessDatabase(false), "club-wine", 42, true)).resolves.toBe(true);
  });
});
