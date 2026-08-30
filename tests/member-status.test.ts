import { describe, expect, it } from "vitest";
import type { Member } from "../constants/mock-data";
import { isNewRegularMember } from "../lib/member-status";

const member = (rank: Member["rank"], joinedAt: string) => ({ rank, joinedAt });
const now = new Date("2026-07-22T12:00:00+09:00");

describe("new member mark", () => {
  it("shows for members of every rank within one calendar month of joining", () => {
    expect(isNewRegularMember(member("regular", "2026-07-10"), now)).toBe(true);
    expect(isNewRegularMember(member("regular", "2026-06-01"), now)).toBe(false);
    expect(isNewRegularMember(member("silver", "2026-07-10"), now)).toBe(true);
  });

  it("does not treat future join dates as new members", () => {
    expect(isNewRegularMember(member("regular", "2026-07-23"), now)).toBe(false);
  });
});
