import { describe, expect, it } from "vitest";
import { BOARD_COMMENTS, BOARD_THREADS } from "../constants/mock-data";
import { createContestAwardComment, getContestWinner, isContestCommentingOpen } from "../lib/gourmet-contest";

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

  it("creates an automatic award comment with the configured IRO+ points", () => {
    const winner = getContestWinner(comments)!;
    const award = createContestAwardComment(contest, winner)!;
    expect(award.isSystem).toBe(true);
    expect(award.content).toContain(`@${winner.author.name}さん`);
    expect(award.content).toContain("500pt");
  });

  it("does not count an automatic award comment as an entrant", () => {
    const systemComment = { ...comments[0], id: "system", isSystem: true, reactions: { "❤️": ["1", "2", "3", "4", "5"] } };
    expect(getContestWinner([...comments, systemComment])?.id).toBe("bc6");
  });
});
