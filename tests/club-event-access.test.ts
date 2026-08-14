import { describe, expect, it } from "vitest";
import { canViewClubEvent } from "../lib/access-control";

describe("club event access", () => {
  const approvedMemberIds = ["member-1", "member-2"];

  it("allows approved club members to view and apply", () => {
    expect(canViewClubEvent("user", "member-1", approvedMemberIds)).toBe(true);
  });

  it("keeps club event details private from non-members", () => {
    expect(canViewClubEvent("user", "outsider", approvedMemberIds)).toBe(false);
    expect(canViewClubEvent("operator", "outsider", approvedMemberIds)).toBe(false);
  });

  it("allows administrators to moderate every club event", () => {
    expect(canViewClubEvent("admin", "admin-1", approvedMemberIds)).toBe(true);
  });
});
