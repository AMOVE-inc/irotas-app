import type { Club } from "@/constants/mock-data";

export type ClubViewerAccess = {
  isMember: boolean;
  hasApplied: boolean;
  isPending: boolean;
  isLeader: boolean;
};

export function clubMembershipActionLabel(
  access: Pick<ClubViewerAccess, "isMember" | "hasApplied">,
) {
  if (access.isMember) return "入部済み";
  if (access.hasApplied) return "審査中（申請済み）";
  return "入部申請する";
}

export function clubMembershipSortPriority(
  access: Pick<ClubViewerAccess, "isMember" | "hasApplied">,
) {
  if (access.isMember) return 0;
  if (access.hasApplied) return 1;
  return 2;
}

/**
 * The bundled club catalog contains legacy preview membership for CURRENT_USER.
 * Once a real member is authenticated, only server-provided viewer metadata may
 * be used for authorization. Otherwise another account can inherit the preview
 * user's membership or leader status while the live catalog is loading.
 */
export function getClubViewerAccess(
  club: Club,
  authenticatedMemberId: string | null | undefined,
  legacyViewerId: string,
): ClubViewerAccess {
  const hasAuthenticatedMember = Boolean(authenticatedMemberId);
  const status = club.viewerMembershipStatus;

  return {
    isMember: status === "approved" || (!hasAuthenticatedMember && club.memberIds.includes(legacyViewerId)),
    hasApplied:
      status === "pending" ||
      status === "on_hold" ||
      (!hasAuthenticatedMember && club.applicantIds.includes(legacyViewerId)),
    isPending:
      status === "on_hold" ||
      (!hasAuthenticatedMember && club.applications.some(
        (application) => application.memberId === legacyViewerId && application.status === "on_hold",
      )),
    isLeader: club.viewerIsLeader === true || (!hasAuthenticatedMember && club.leaderId === legacyViewerId),
  };
}
