import { describe, expect, it } from "vitest";
import { SEEDED_GOURMET_CONTESTS } from "../constants/imported-gourmet-contests";

describe("seeded Discord gourmet contests", () => {
  it("publishes the completed contests and their comments", () => {
    expect(SEEDED_GOURMET_CONTESTS.map((item) => item.thread.title)).toEqual([
      "第23回 立ち飲み屋",
      "第22回 No.1 オムライス選手権",
    ]);
    expect(SEEDED_GOURMET_CONTESTS.reduce((sum, item) => sum + item.comments.length, 0)).toBe(17);
    expect(SEEDED_GOURMET_CONTESTS.every((item) => item.thread.gourmetContest?.archived)).toBe(true);
  });

  it("keeps images and recorded heart counts", () => {
    const comments = SEEDED_GOURMET_CONTESTS.flatMap((item) => item.comments);
    expect(comments.filter((comment) => comment.images?.length).length).toBeGreaterThanOrEqual(5);
    expect(comments.find((comment) => comment.id === "1526220527163670638")?.reactions?.["❤️"]).toHaveLength(4);
  });
});
