import { beforeEach, describe, expect, it } from "vitest";
import { effectiveUnreadTotal, markChatRoomOptimisticallyRead, resetOptimisticChatReadsForTests } from "../lib/chat-unread-sync";

describe("chat unread badge synchronization", () => {
  beforeEach(() => resetOptimisticChatReadsForTests());

  it("removes a room from the total immediately while its read request is being persisted", () => {
    const rooms = [{ id: "room-a", unreadCount: 1 }, { id: "room-b", unreadCount: 2 }];
    markChatRoomOptimisticallyRead("room-a", 1);
    expect(effectiveUnreadTotal(rooms)).toBe(2);
  });

  it("accepts the server count again after the optimistic window", () => {
    const now = Date.now();
    markChatRoomOptimisticallyRead("room-a", 1);
    expect(effectiveUnreadTotal([{ id: "room-a", unreadCount: 1 }], now + 31_000)).toBe(1);
  });
});
