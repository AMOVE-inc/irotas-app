import { describe, expect, it } from "vitest";
import { boardPollResult, isBoardPollOpen } from "../lib/board-polls";
import type { BoardPoll } from "../constants/mock-data";

const poll: BoardPoll = {
  question: "次回の開催日は？",
  deadline: "2026-08-20",
  options: [
    { id: "one", text: "土曜日", voterIds: ["m1", "m2"] },
    { id: "two", text: "日曜日", voterIds: ["m3"] },
  ],
};

describe("board polls", () => {
  it("期限当日は受付中、翌日は終了として扱う", () => {
    expect(isBoardPollOpen(poll, new Date("2026-08-20T12:00:00+09:00"))).toBe(true);
    expect(isBoardPollOpen(poll, new Date("2026-08-21T00:00:00+09:00"))).toBe(false);
  });

  it("最多得票の選択肢を結果として返す", () => {
    expect(boardPollResult(poll)).toBe("土曜日（2票）");
  });

  it("同票なら両方を結果に含める", () => {
    const tied = { ...poll, options: poll.options.map((option) => ({ ...option, voterIds: ["m1"] })) };
    expect(boardPollResult(tied)).toBe("土曜日・日曜日（1票）");
  });
});
