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

/** Keep the local choice visible until a fresh server read confirms it. */
export function reconcileOptimisticReactions(
  server: Record<string, string[]> | undefined,
  pending: ReadonlyMap<string, boolean>,
  memberId: string,
) {
  const reactions = Object.fromEntries(Object.entries(server ?? {}).map(([emoji, members]) => [emoji, [...members]])) as Record<string, string[]>;
  const remaining = new Map(pending);
  for (const [emoji, active] of pending) {
    const members = reactions[emoji] ?? [];
    if (members.includes(memberId) === active) { remaining.delete(emoji); continue; }
    const updated = active ? [...members, memberId] : members.filter((id) => id !== memberId);
    if (updated.length) reactions[emoji] = updated;
    else delete reactions[emoji];
  }
  return { reactions, remaining };
}
