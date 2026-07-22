import { describe, expect, it } from "vitest";
import { BOARD_COMMENTS, BOARD_THREADS } from "../constants/mock-data";
import { createContestPrizeCoupon, getContestWinner, isContestCommentingOpen } from "../lib/gourmet-contest";
import { getCouponAvailability } from "../lib/coupon-rules";

describe("gourmet contest", () => {
  const contest = BOARD_THREADS.find((thread) => thread.id === "t11")!;
  const comments = BOARD_COMMENTS.filter((comment) => comment.threadId === contest.id);

  it("selects the comment with the most hearts", () => {
    expect(getContestWinner(comments)?.id).toBe("bc6");
  });

  it("closes comments after the configured deadline", () => {
    expect(isContestCommentingOpen(contest, new Date("2026-07-31T12:00:00+09:00"))).toBe(true);
    expect(isContestCommentingOpen(contest, new Date("2026-08-01T00:00:00+09:00"))).toBe(false);
  });

  it("creates a coupon visible only to the winner", () => {
    const coupon = createContestPrizeCoupon(contest, "u2")!;
    expect(getCouponAvailability(coupon, "gold", undefined, new Date("2026-08-01T00:00:00+09:00"), "u2")).toBe("available");
    expect(getCouponAvailability(coupon, "gold", undefined, new Date("2026-08-01T00:00:00+09:00"), "u1")).toBe("rank_locked");
  });
});
