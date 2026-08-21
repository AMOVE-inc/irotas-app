import { describe, expect, it } from "vitest";
import { CLUBS, CURRENT_USER } from "../constants/mock-data";
import {
  clubMembershipActionLabel,
  clubMembershipSortPriority,
  getClubViewerAccess,
} from "../lib/club-viewer-access";

describe("club viewer access", () => {
  const breadClub = CLUBS.find((club) => club.name === "パン部")!;

  it("does not inherit the legacy preview user's membership or leader role after real login", () => {
    const access = getClubViewerAccess(breadClub, "IRO0026", CURRENT_USER.id);

    expect(access.isMember).toBe(false);
    expect(access.isLeader).toBe(false);
    expect(access.hasApplied).toBe(false);
  });

  it("uses server viewer metadata for an authenticated member", () => {
    const access = getClubViewerAccess(
      { ...breadClub, viewerMembershipStatus: "approved", viewerIsLeader: false },
      "IRO0026",
      CURRENT_USER.id,
    );

    expect(access.isMember).toBe(true);
    expect(access.isLeader).toBe(false);
  });

  it("keeps the legacy catalog fallback for signed-out previews", () => {
    const access = getClubViewerAccess(breadClub, null, CURRENT_USER.id);

    expect(access.isMember).toBe(true);
    expect(access.isLeader).toBe(true);
  });

  it("shows a clear membership action for every club-list state", () => {
    expect(clubMembershipActionLabel({ isMember: false, hasApplied: false })).toBe("入部申請する");
    expect(clubMembershipActionLabel({ isMember: false, hasApplied: true })).toBe("審査中（申請済み）");
    expect(clubMembershipActionLabel({ isMember: true, hasApplied: false })).toBe("入部済み");
  });

  it("sorts joined clubs first, pending applications second, and other clubs last", () => {
    expect(clubMembershipSortPriority({ isMember: true, hasApplied: false })).toBe(0);
    expect(clubMembershipSortPriority({ isMember: false, hasApplied: true })).toBe(1);
    expect(clubMembershipSortPriority({ isMember: false, hasApplied: false })).toBe(2);
  });
});
