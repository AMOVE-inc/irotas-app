/** Builds the attendee list shown to members, keeping the organizer visible exactly once. */
export function getConfirmedParticipantDisplayIds(
  participantIds: readonly string[] | undefined,
  companionIds: readonly string[] | undefined,
  organizerId?: string,
): string[] {
  const confirmed = [...new Set([...(participantIds ?? []), ...(companionIds ?? [])])];
  return organizerId ? [organizerId, ...confirmed.filter((memberId) => memberId !== organizerId)] : confirmed;
}
