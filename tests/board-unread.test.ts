import { describe, expect, it } from "vitest";
import { createInitialBoardReadCounts, supportsBoardNewBadge } from "../lib/board-unread";

describe("board unread baseline", () => {
  it("marks every existing post and comment as the initial read baseline", () => {
    expect(createInitialBoardReadCounts(["thread-a", "thread-b"], { "thread-a": 3 })).toEqual({
      "thread-a": 3,
      "thread-b": 0,
    });
  });

  it("limits blue new badges to the requested board sections", () => {
    expect(supportsBoardNewBadge("meal-report")).toBe(true);
    expect(supportsBoardNewBadge("club-golf")).toBe(true);
    expect(supportsBoardNewBadge("introduction")).toBe(false);
    expect(supportsBoardNewBadge("gourmet-contest")).toBe(false);
  });
});
