export function toggleReactionMember(
  reactions: Record<string, string[]> | undefined,
  emoji: string,
  memberId: string,
): Record<string, string[]> {
  const next = Object.fromEntries(Object.entries(reactions ?? {}).map(([key, members]) => [key, [...members]]));
  const members = next[emoji] ?? [];
  next[emoji] = members.includes(memberId)
    ? members.filter((id) => id !== memberId)
    : [...members, memberId];
  if (next[emoji].length === 0) delete next[emoji];
  return next;
}
