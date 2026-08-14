import { describe, expect, it } from "vitest";
import { SEEDED_GOURMET_CONTESTS } from "../constants/imported-gourmet-contests";

describe("seeded Discord gourmet contests", () => {
  it("publishes all 24 Discord contests, including the active contest", () => {
    expect(SEEDED_GOURMET_CONTESTS).toHaveLength(24);
    expect(SEEDED_GOURMET_CONTESTS.at(0)?.thread.title).toBe("第24回 麻辣湯");
    expect(SEEDED_GOURMET_CONTESTS.at(-1)?.thread.title).toBe("第1回 初デートにぴったりなお店");
    expect(SEEDED_GOURMET_CONTESTS.reduce((sum, item) => sum + item.comments.length, 0)).toBe(323);
    expect(SEEDED_GOURMET_CONTESTS.at(0)?.thread.gourmetContest?.archived).not.toBe(true);
    expect(SEEDED_GOURMET_CONTESTS.slice(1).every((item) => item.thread.gourmetContest?.archived)).toBe(true);
  });

  it("keeps images and recorded heart counts", () => {
    const comments = SEEDED_GOURMET_CONTESTS.flatMap((item) => item.comments);
    const attachmentCount = SEEDED_GOURMET_CONTESTS.reduce((sum, item) => sum + (item.thread.images?.length ?? 0) + (item.thread.videos?.length ?? 0) + item.comments.reduce((commentSum, comment) => commentSum + (comment.images?.length ?? 0) + (comment.videos?.length ?? 0), 0), 0);
    expect(attachmentCount).toBe(298);
    expect(comments.filter((comment) => comment.images?.length).length).toBeGreaterThan(100);
    expect(comments.find((comment) => comment.id === "1526220527163670638")?.reactions?.["❤️"]).toHaveLength(4);
    expect(comments.find((comment) => comment.id === "1536327351061708902")?.reactions?.["❤️"]).toHaveLength(6);
  });
});
