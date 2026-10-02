export function normalizedUnreadCount(value: unknown, itemCount: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || itemCount <= 0) return 0;
  return Math.min(itemCount, Math.floor(parsed));
}

export function initialMessageIndex(itemCount: number, unreadCount: unknown, inverted = false): number | null {
  if (itemCount <= 0) return null;
  const unread = normalizedUnreadCount(unreadCount, itemCount);
  if (inverted) return unread > 0 ? unread - 1 : 0;
  return unread > 0 ? itemCount - unread : itemCount - 1;
}

export function firstUnreadMessageIndex<T>(
  items: T[],
  unreadCount: unknown,
  isUnreadCandidate: (item: T) => boolean,
): number | null {
  let remaining = normalizedUnreadCount(unreadCount, items.length);
  if (remaining === 0) return null;

  let oldestCandidateIndex: number | null = null;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!isUnreadCandidate(items[index])) continue;
    oldestCandidateIndex = index;
    remaining -= 1;
    if (remaining === 0) return index;
  }
  return oldestCandidateIndex;
}

export function firstUnreadItemId<T extends { id: string; authorId: string; createdAt: string }>(
  items: T[],
  readCount: number | undefined,
  viewerId: string,
  visibleAfter?: number,
): string | null {
  const start = Math.max(0, Math.min(items.length, readCount ?? 0));
  return items.slice(start).find((item) => item.authorId !== viewerId && (
    visibleAfter === undefined || (Number.isFinite(Date.parse(item.createdAt)) && Date.parse(item.createdAt) > visibleAfter)
  ))?.id ?? null;
}
