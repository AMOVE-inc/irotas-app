import type { BoardComment, BoardThread } from "@/constants/mock-data";

/** The list shows the newest comment date, or the original post date when empty. */
export function boardThreadActivityDate(thread: Pick<BoardThread, "createdAt" | "lastUpdated" | "lastCommentAt">, comments: readonly Pick<BoardComment, "createdAt">[]): string {
  // The server may know about newer app comments before this client loads the
  // complete comment list for a thread.
  const base = thread.lastCommentAt ?? thread.createdAt ?? thread.lastUpdated;
  return comments.reduce((latest, comment) => Date.parse(comment.createdAt) > Date.parse(latest) ? comment.createdAt : latest, base);
}
