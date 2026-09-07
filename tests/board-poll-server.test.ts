import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/0016_board_poll_votes.sql", "utf8");
const board = readFileSync("sites/board-content.ts", "utf8");
const automation = readFileSync("sites/home-automation.ts", "utf8");
const screen = readFileSync("app/(tabs)/board.tsx", "utf8");

describe("shared board polls", () => {
  it("stores votes and finalizations in shared tables", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS board_poll_votes");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS board_poll_finalizations");
    expect(migration).toContain("SET value = '17'");
  });

  it("authenticates poll reads and toggles votes on the server", () => {
    expect(board).toContain("POLL_PATH");
    expect(board).toContain("INSERT OR IGNORE INTO board_poll_votes");
    expect(board).toContain("DELETE FROM board_poll_votes");
    expect(board).toContain("canAccessBoardCategory");
  });

  it("finalizes expired board polls and posts chat poll results idempotently", () => {
    expect(automation).toContain("finalizeExpiredBoardPolls");
    expect(automation).toContain("poll-result:${key}:${target}");
    expect(automation).toContain("status = 'delivered'");
    expect(automation).toContain("finalizeExpiredChatPolls");
    expect(automation).toContain("chat-poll-result:${row.id}");
    expect(automation).toContain("【投票結果】");
  });

  it("uses shared polls in the UI with a local archive fallback", () => {
    expect(screen).toContain("Api.getSharedBoardPoll");
    expect(screen).toContain("Api.voteSharedBoardPoll");
    expect(screen).toContain("loadBoardPoll(ownerKey, poll)");
  });
});
