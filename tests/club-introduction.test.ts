import { describe, expect, it } from "vitest";
import { CLUBS } from "../constants/mock-data";
import { getClubIntroductionContent, getLatestClubActivityReports } from "../lib/club-introduction";
import rawArchive from "../data/discord-board-2026-08-14.json";
import { parseDiscordBoardArchive, type RawDiscordBoardArchive } from "../lib/discord-board-import";

const archiveThreads = parseDiscordBoardArchive(rawArchive as RawDiscordBoardArchive).threads;

describe("club introduction", () => {
  it("uses the migrated board introduction for the application overview", () => {
    const breadClub = CLUBS.find((club) => club.name === "パン部")!;
    const content = getClubIntroductionContent(breadClub, archiveThreads);

    expect(content).toContain("パン部のコンセプト");
    expect(content).toContain("小麦に溺れる");
    expect(content).not.toContain("入部申請フォーム");
  });

  it("falls back to the catalog description when an introduction is unavailable", () => {
    expect(getClubIntroductionContent({ name: "テスト部", description: "テスト部の説明" })).toBe("テスト部の説明");
  });

  it("returns the latest club activity reports in descending order", () => {
    const reports = getLatestClubActivityReports(archiveThreads, 3);

    expect(reports).toHaveLength(3);
    expect(reports.every((report) => report.category === "club-all")).toBe(true);
    expect(Date.parse(reports[0].lastUpdated)).toBeGreaterThanOrEqual(Date.parse(reports[1].lastUpdated));
    expect(Date.parse(reports[1].lastUpdated)).toBeGreaterThanOrEqual(Date.parse(reports[2].lastUpdated));
  });
});
