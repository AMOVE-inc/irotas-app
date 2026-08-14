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
    expect(award.content).toBe(`@everyone\n\n**# ${contest.title}** 結果発表🏆\n\n見事一位に選ばれたのは...\n**@${winner.author.name}   さん！おめでとうございます🎉**\n景品として**【IRO+ポイント 500pt】**をプレゼントさせていただきます🎁\n\nぜひ次回のグルメ選手権もご参加お待ちしております！`);
  });

  it("does not count an automatic award comment as an entrant", () => {
    const systemComment = { ...comments[0], id: "system", isSystem: true, reactions: { "❤️": ["1", "2", "3", "4", "5"] } };
    expect(getContestWinner([...comments, systemComment])?.id).toBe("bc6");
  });
});
