import { describe, expect, it } from "vitest";
import { formatCommentTimestamp } from "../lib/comment-timestamp";

describe("comment timestamp", () => {
  it("shows only the time for comments posted today in Japan", () => {
    expect(formatCommentTimestamp("2026-09-18T15:05:00Z", new Date("2026-09-19T15:10:00+09:00"))).toBe("00:05");
  });

  it("uses yesterday at the Japan calendar-day boundary", () => {
    expect(formatCommentTimestamp("2026-09-19T14:59:00Z", new Date("2026-09-20T00:10:00+09:00"))).toBe("昨日 23:59");
  });

  it("shows the full date and time for older comments", () => {
    expect(formatCommentTimestamp("2026-09-17T03:34:00Z", new Date("2026-09-19T15:10:00+09:00"))).toBe("2026/09/17 12:34");
  });
});
