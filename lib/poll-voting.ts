export function viewerHasPollVote(voterGroups: readonly (readonly string[])[], viewerId: string): boolean {
  return voterGroups.some((memberIds) => memberIds.includes(viewerId));
}

export function canSelectPollOption(hasVoted: boolean, editingVote: boolean, disabled = false): boolean {
  return !disabled && (!hasVoted || editingVote);
}
