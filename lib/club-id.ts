const LEGACY_CLUB_ID_ALIASES: Record<string, string> = {
  "club-stage": "club-theater",
  "club-sports-viewing": "club-sports-watch",
  "club-cooking": "club-cooking-class",
};

/** Convert Discord-era club IDs to the IDs used by the current app. */
export function canonicalClubId(clubId: string | null | undefined) {
  if (!clubId) return clubId;
  return LEGACY_CLUB_ID_ALIASES[clubId] ?? clubId;
}
