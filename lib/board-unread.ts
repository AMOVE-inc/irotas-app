export const BOARD_NEW_BADGE_CATEGORIES = new Set(["meal-report", "gourmet-advice", "free-chat"]);

export function supportsBoardNewBadge(categoryKey: string) {
  return BOARD_NEW_BADGE_CATEGORIES.has(categoryKey) || categoryKey === "club" || categoryKey.startsWith("club-");
}

export function createInitialBoardReadCounts(
  threadIds: readonly string[],
  commentCounts: Readonly<Record<string, number>>,
) {
  return Object.fromEntries(threadIds.map((threadId) => [threadId, commentCounts[threadId] ?? 0]));
}
