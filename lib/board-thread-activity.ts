import type { BoardComment, BoardThread } from "@/constants/mock-data";

/** The list shows the newest comment date, or the original post date when empty. */
export function boardThreadActivityDate(thread: Pick<BoardThread, "createdAt" | "lastUpdated">, comments: readonly Pick<BoardComment, "createdAt">[]): string {
  if (!comments.length) return thread.createdAt ?? thread.lastUpdated;
  return comments.reduce((latest, comment) => Date.parse(comment.createdAt) > Date.parse(latest) ? comment.createdAt : latest, comments[0].createdAt);
}
