type UnreadRoom = { id: string; unreadCount?: number | null };
type Listener = (roomId: string, clearedCount: number) => void;

const optimisticReads = new Map<string, number>();
const listeners = new Set<Listener>();
const OPTIMISTIC_READ_MS = 30_000;

export function markChatRoomOptimisticallyRead(roomId: string, clearedCount = 0) {
  optimisticReads.set(roomId, Date.now() + OPTIMISTIC_READ_MS);
  for (const listener of listeners) listener(roomId, Math.max(0, clearedCount));
}

export function subscribeToOptimisticChatReads(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function effectiveUnreadTotal(rooms: UnreadRoom[], now = Date.now()) {
  return rooms.reduce((total, room) => {
    // These rooms are intentionally absent from the chat list. Counting them
    // produces a badge that the member has no screen from which to clear.
    if (room.id === "board-introduction") return total;
    const count = Math.max(0, room.unreadCount ?? 0);
    const expiresAt = optimisticReads.get(room.id);
    if (count === 0) optimisticReads.delete(room.id);
    if (expiresAt && expiresAt > now) return total;
    if (expiresAt) optimisticReads.delete(room.id);
    return total + count;
  }, 0);
}

export function resetOptimisticChatReadsForTests() {
  optimisticReads.clear();
}
