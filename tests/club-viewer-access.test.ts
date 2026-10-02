import { describe, expect, it } from "vitest";
import { CLUBS, CURRENT_USER } from "../constants/mock-data";
import {
  clubMembershipActionLabel,
  clubMembershipControlVisibility,
  clubMembershipSortPriority,
  canViewerAccessClubContent,
  getClubViewerAccess,
  resolveViewerMemberId,
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

  it("denies private content to unjoined and pending authenticated members", () => {
    expect(canViewerAccessClubContent(breadClub, "IRO-OUTSIDER", CURRENT_USER.id)).toBe(false);
    expect(canViewerAccessClubContent(
      { ...breadClub, viewerMembershipStatus: "pending", viewerIsLeader: false },
      "IRO-PENDING",
      CURRENT_USER.id,
    )).toBe(false);
  });

  it("allows approved members, club leaders, and administrators", () => {
    expect(canViewerAccessClubContent(
      { ...breadClub, viewerMembershipStatus: "approved", viewerIsLeader: false },
      "IRO-MEMBER",
      CURRENT_USER.id,
    )).toBe(true);
    expect(canViewerAccessClubContent(
      { ...breadClub, viewerMembershipStatus: null, viewerIsLeader: true },
      "IRO-LEADER",
      CURRENT_USER.id,
    )).toBe(true);
    expect(canViewerAccessClubContent(breadClub, "IRO-ADMIN", CURRENT_USER.id, true)).toBe(true);
  });

  it("fails closed when an authenticated session has no member ID", () => {
    expect(resolveViewerMemberId(undefined, true, CURRENT_USER.id)).toBe("");
    expect(resolveViewerMemberId(undefined, false, CURRENT_USER.id)).toBe(CURRENT_USER.id);
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

  it("keeps administrator management access separate from club membership controls", () => {
    expect(clubMembershipControlVisibility({ isMember: false, hasApplied: false, isLeader: false }))
      .toEqual({ canApply: true, canLeave: false });
    expect(clubMembershipControlVisibility({ isMember: false, hasApplied: true, isLeader: false }))
      .toEqual({ canApply: false, canLeave: false });
    expect(clubMembershipControlVisibility({ isMember: true, hasApplied: false, isLeader: false }))
      .toEqual({ canApply: false, canLeave: true });
  });
});
