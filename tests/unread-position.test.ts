import { describe, expect, it } from "vitest";
import { firstUnreadItemId, firstUnreadMessageIndex, initialMessageIndex, normalizedUnreadCount } from "../lib/unread-position";

describe("unread opening positions", () => {
  it("opens a chronological chat at the first unread message or latest message", () => {
    expect(initialMessageIndex(10, 3)).toBe(7);
    expect(initialMessageIndex(10, 0)).toBe(9);
  });

  it("opens an inverted chat at its oldest unread message or latest message", () => {
    expect(initialMessageIndex(10, 3, true)).toBe(2);
    expect(initialMessageIndex(10, 0, true)).toBe(0);
  });

  it("clamps stale unread counts to the loaded collection", () => {
    expect(normalizedUnreadCount("99", 4)).toBe(4);
    expect(initialMessageIndex(4, "99")).toBe(0);
    expect(initialMessageIndex(0, 2)).toBeNull();
  });

  it("finds the first unread item that is visible and not authored by the viewer", () => {
    const items = [
      { id: "a", authorId: "other", createdAt: "2026-09-01T00:00:00.000Z" },
      { id: "b", authorId: "me", createdAt: "2026-09-02T00:00:00.000Z" },
      { id: "c", authorId: "other", createdAt: "2026-09-03T00:00:00.000Z" },
    ];
    expect(firstUnreadItemId(items, 1, "me")).toBe("c");
    expect(firstUnreadItemId(items, 0, "me", Date.parse("2026-09-02T00:00:00.000Z"))).toBe("c");
    expect(firstUnreadItemId(items, 3, "me")).toBeNull();
  });

  it("places the unread marker using only messages from other participants", () => {
    const items = [
      { id: "other-old", kind: "other" },
      { id: "system", kind: "system" },
      { id: "mine", kind: "mine" },
      { id: "other-new", kind: "other" },
      { id: "mine-new", kind: "mine" },
    ];
    const isOtherPost = (item: (typeof items)[number]) => item.kind === "other";
    expect(firstUnreadMessageIndex(items, 1, isOtherPost)).toBe(3);
    expect(firstUnreadMessageIndex(items, 2, isOtherPost)).toBe(0);
  });
});
