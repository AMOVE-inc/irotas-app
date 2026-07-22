import { describe, expect, it } from "vitest";
import type { ChatRoom } from "../constants/mock-data";
import { PREFECTURES } from "../constants/profile-options";
import { sortRoomsByRecent } from "../lib/chat-order";

const room = (id: string, lastMessageAt?: string): ChatRoom => ({
  id,
  name: id,
  type: "group",
  sourceId: id,
  participants: ["u1"],
  createdBy: "u1",
  lastMessageAt,
});

describe("chat ordering", () => {
  it("shows the most recently updated room first without mutating the source", () => {
    const rooms = [room("old", "2026-07-01T10:00:00+09:00"), room("new", "2026-07-22T10:00:00+09:00"), room("none")];
    expect(sortRoomsByRecent(rooms).map((item) => item.id)).toEqual(["new", "old", "none"]);
    expect(rooms.map((item) => item.id)).toEqual(["old", "new", "none"]);
  });
});

describe("profile options", () => {
  it("contains all 47 prefectures plus overseas", () => {
    expect(PREFECTURES).toHaveLength(48);
    expect(PREFECTURES).toContain("北海道");
    expect(PREFECTURES).toContain("沖縄県");
    expect(PREFECTURES).toContain("海外");
  });
});
