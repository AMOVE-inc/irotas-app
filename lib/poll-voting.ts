export function viewerHasPollVote(voterGroups: readonly (readonly string[])[], viewerId: string): boolean {
  return voterGroups.some((memberIds) => memberIds.includes(viewerId));
}

export function canSelectPollOption(hasVoted: boolean, editingVote: boolean, disabled = false): boolean {
  return !disabled && (!hasVoted || editingVote);
}

export function nextPollSelection<T extends string>(
  selected: readonly T[],
  option: T,
  allowMultiple: boolean,
): T[] {
  if (selected.includes(option)) return selected.filter((item) => item !== option);
  return allowMultiple ? [...selected, option] : [option];
}

export function canSubmitPollSelection(selectedCount: number, editingVote: boolean): boolean {
  return editingVote || selectedCount > 0;
}
