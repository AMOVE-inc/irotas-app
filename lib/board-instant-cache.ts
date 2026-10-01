import type { BoardComment, BoardThread } from "@/constants/mock-data";

export type BoardInstantSnapshot = {
  threads: BoardThread[];
  comments: Record<string, BoardComment[]>;
  complete: boolean;
};

export const boardInstantSnapshots = new Map<string, BoardInstantSnapshot>();

export const boardSnapshotKey = (memberId: string, category: string) => `${memberId}:${category}`;

export function clearBoardInstantCache() {
  boardInstantSnapshots.clear();
}
