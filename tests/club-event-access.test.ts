import { describe, expect, it } from "vitest";
import { canCreateClubEvent, canViewClubEvent } from "../lib/access-control";

describe("club event access", () => {
  const approvedMemberIds = ["member-1", "member-2"];

  it("allows approved club members to view and apply", () => {
    expect(canViewClubEvent("user", "member-1", approvedMemberIds)).toBe(true);
  });

  it("keeps club event details private from regular non-members", () => {
    expect(canViewClubEvent("user", "outsider", approvedMemberIds)).toBe(false);
  });

  it("allows operators and administrators to view every club event", () => {
    expect(canViewClubEvent("admin", "admin-1", approvedMemberIds)).toBe(true);
    expect(canViewClubEvent("operator", "operator-1", approvedMemberIds)).toBe(true);
    expect(canViewClubEvent("user", "operator-1", approvedMemberIds, "operator")).toBe(true);
  });

  it("allows only club members or the leader to register a club event", () => {
    expect(canCreateClubEvent("member-1", approvedMemberIds, "leader-1")).toBe(true);
    expect(canCreateClubEvent("leader-1", approvedMemberIds, "leader-1")).toBe(true);
    expect(canCreateClubEvent("outsider", approvedMemberIds, "leader-1")).toBe(false);
  });
});
