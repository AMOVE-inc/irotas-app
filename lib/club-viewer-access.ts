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

export function clubMembershipControlVisibility(
  access: Pick<ClubViewerAccess, "isMember" | "hasApplied" | "isLeader">,
) {
  return {
    canApply: !access.isMember && !access.hasApplied && !access.isLeader,
    canLeave: access.isMember && !access.isLeader,
  };
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
  hasAuthenticatedSession = false,
): ClubViewerAccess {
  const allowLegacyViewer = !hasAuthenticatedSession && !authenticatedMemberId;
  const status = club.viewerMembershipStatus;

  return {
    isMember: status === "approved" || (allowLegacyViewer && club.memberIds.includes(legacyViewerId)),
    hasApplied:
      status === "pending" ||
      status === "on_hold" ||
      (allowLegacyViewer && club.applicantIds.includes(legacyViewerId)),
    isPending:
      status === "on_hold" ||
      (allowLegacyViewer && club.applications.some(
        (application) => application.memberId === legacyViewerId && application.status === "on_hold",
      )),
    isLeader: club.viewerIsLeader === true || (allowLegacyViewer && club.leaderId === legacyViewerId),
  };
}

/**
 * Club-only content must be authorized from the authenticated viewer metadata.
 * The legacy viewer is only used by signed-out local previews.
 */
export function canViewerAccessClubContent(
  club: Club,
  authenticatedMemberId: string | null | undefined,
  legacyViewerId: string,
  isAdministrator = false,
  hasAuthenticatedSession = false,
): boolean {
  if (isAdministrator) return true;
  const access = getClubViewerAccess(
    club,
    authenticatedMemberId,
    legacyViewerId,
    hasAuthenticatedSession,
  );
  return access.isMember || access.isLeader;
}

/** Real sessions fail closed when their member ID is unexpectedly missing. */
export function resolveViewerMemberId(
  authenticatedMemberId: string | null | undefined,
  hasAuthenticatedSession: boolean,
  legacyViewerId: string,
): string {
  return authenticatedMemberId ?? (hasAuthenticatedSession ? "" : legacyViewerId);
}
