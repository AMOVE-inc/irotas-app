import { describe, expect, it } from "vitest";
import { boardThreadActivityDate } from "../lib/board-thread-activity";

describe("board thread activity date", () => {
  const thread = { createdAt: "2026-09-01T12:00:00.000Z", lastUpdated: "2026-09-05T12:00:00.000Z" };

  it("shows post creation when there are no comments", () => {
    expect(boardThreadActivityDate(thread, [])).toBe(thread.createdAt);
  });

  it("shows the newest comment regardless of API ordering", () => {
    expect(boardThreadActivityDate(thread, [
      { createdAt: "2026-09-19T10:00:00.000Z" },
      { createdAt: "2026-09-08T10:00:00.000Z" },
    ])).toBe("2026-09-19T10:00:00.000Z");
  });
});
