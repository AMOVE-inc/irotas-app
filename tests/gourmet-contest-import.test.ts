import { describe, expect, it } from "vitest";
import { mergeWithSeededGourmetContests, parseGourmetContestImport } from "../lib/gourmet-contest-import";
import { createContestPrizeCoupon } from "../lib/gourmet-contest";

const csv = `record_type,contest_id,title,content,author_member_id,author_name,created_at,comment_deadline,prize_title,prize_description,prize_expires_at,attachment_urls,comment_id,heart_count,winner_name
contest,gp1,第1回,好きなお店を投稿,m1,運営,2025-01-01T10:00:00+09:00,2025-01-31,優勝券,1000円引き,2025-03-31,https://example.com/a.jpg,,,花子
comment,gp1,,銀座のお店,m2,花子,2025-01-10T10:00:00+09:00,,,,,https://example.com/comment.jpg,c1,12,
comment,gp1,,恵比寿のお店,m3,太郎,2025-01-11T10:00:00+09:00,,,,,,c2,5,`;

describe("past gourmet contest import", () => {
  it("大会・コメント・ハート数・優勝者を保持する", () => {
    const [contest] = parseGourmetContestImport(csv);
    expect(contest.thread.title).toBe("第1回");
    expect(contest.thread.gourmetContest?.winnerName).toBe("花子");
    expect(contest.comments).toHaveLength(2);
    expect(contest.comments[0].reactions?.["❤️"]).toHaveLength(12);
    expect(contest.comments[0].images).toEqual(["https://example.com/comment.jpg"]);
    expect(contest.thread.commentCount).toBe(2);
  });

  it("移行済み大会にはクーポンを再配布しない", () => {
    const [contest] = parseGourmetContestImport(csv);
    expect(createContestPrizeCoupon(contest.thread, "m2")).toBeUndefined();
  });
});

describe("mergeWithSeededGourmetContests", () => {
  it("removes legacy placeholder rounds and keeps only the complete seeded archive", () => {
    const legacy = {
      thread: { ...parseGourmetContestImport(csv)[0].thread, id: "imported-contest-history-14", title: "第14回 うどん No.1決定戦" },
      comments: [],
    };
    const merged = mergeWithSeededGourmetContests([legacy]);
    expect(merged).toHaveLength(24);
    expect(merged.some((item) => item.thread.id === legacy.thread.id)).toBe(false);
    expect(merged.find((item) => item.thread.title.startsWith("第14回"))?.comments.length).toBeGreaterThan(0);
  });
});
