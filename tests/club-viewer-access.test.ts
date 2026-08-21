import { describe, expect, it } from "vitest";
import { CLUBS, CURRENT_USER } from "../constants/mock-data";
import { getClubViewerAccess } from "../lib/club-viewer-access";

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
});
