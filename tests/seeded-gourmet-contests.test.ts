import { describe, expect, it } from "vitest";
import { SEEDED_GOURMET_CONTESTS } from "../constants/imported-gourmet-contests";

describe("seeded Discord gourmet contests", () => {
  it("publishes all 24 Discord contests, including the active contest", () => {
    expect(SEEDED_GOURMET_CONTESTS).toHaveLength(24);
    expect(SEEDED_GOURMET_CONTESTS.at(0)?.thread.title).toBe("第24回 麻辣湯");
    expect(SEEDED_GOURMET_CONTESTS.at(-1)?.thread.title).toBe("第1回 初デートにぴったりなお店");
    expect(SEEDED_GOURMET_CONTESTS.reduce((sum, item) => sum + item.comments.length, 0)).toBe(18);
    expect(SEEDED_GOURMET_CONTESTS.at(0)?.thread.gourmetContest?.archived).not.toBe(true);
    expect(SEEDED_GOURMET_CONTESTS.slice(1).every((item) => item.thread.gourmetContest?.archived)).toBe(true);
  });

  it("keeps images and recorded heart counts", () => {
    const comments = SEEDED_GOURMET_CONTESTS.flatMap((item) => item.comments);
    expect(comments.filter((comment) => comment.images?.length).length).toBeGreaterThanOrEqual(5);
    expect(comments.find((comment) => comment.id === "1526220527163670638")?.reactions?.["❤️"]).toHaveLength(4);
    expect(comments.find((comment) => comment.id === "1536327351992979516")?.reactions?.["❤️"]).toHaveLength(6);
  });
});
