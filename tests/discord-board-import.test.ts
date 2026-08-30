import { describe, expect, it } from "vitest";
import rawArchive from "../data/discord-board-2026-08-29.json";
import { parseDiscordBoardArchive, type RawDiscordBoardArchive } from "../lib/discord-board-import";

describe("Discord board archive", () => {
  const archive = parseDiscordBoardArchive(rawArchive as RawDiscordBoardArchive);

  it("対象カテゴリを新しい掲示板へ移行する", () => {
    const categories = new Set(archive.threads.map((thread) => thread.category));
    expect(categories).toContain("introduction");
    expect(categories).toContain("meal-report");
    expect(categories).toContain("gourmet-advice");
    expect([...categories].some((category) => category.startsWith("club-club-"))).toBe(true);
    expect(categories).toContain("club-introduction");
    expect(categories).toContain("club-all");
  });

  it("excludes operator announcements misclassified as one-star meal reports", () => {
    const archive = parseDiscordBoardArchive(rawArchive as RawDiscordBoardArchive);
    expect(archive.threads.some((thread) => thread.category === "meal-report" && thread.mealReport?.rating === 1 && ["IRO+運営", "IRO＋運営"].includes(thread.author.name))).toBe(false);
  });

  it("移行したコメントと画像を保持する", () => {
    expect(archive.threads.length).toBeGreaterThan(1000);
    expect(Object.values(archive.comments).flat().length).toBeGreaterThan(3000);
    expect(archive.threads.some((thread) => thread.images?.length)).toBe(true);
  });

  it("自己紹介・ごちそうさま・相談室を新テンプレへ変換する", () => {
    expect(archive.threads.find((thread) => thread.category === "introduction")?.selfIntroduction).toBeTruthy();
    expect(archive.threads.find((thread) => thread.category === "meal-report")?.mealReport).toBeTruthy();
    expect(archive.threads.find((thread) => thread.category === "gourmet-advice")?.gourmetAdvice).toBeTruthy();
  });

  it("グルメ相談室の全スレ・コメント・添付画像を保持する", () => {
    const adviceThreads = archive.threads.filter((thread) => thread.category === "gourmet-advice");
    const adviceComments = adviceThreads.flatMap((thread) => archive.comments[thread.id] ?? []);
    expect(adviceThreads.length).toBeGreaterThanOrEqual(50);
    expect(adviceComments.length).toBeGreaterThanOrEqual(375);
    expect(adviceComments.flatMap((comment) => comment.images ?? []).length).toBeGreaterThanOrEqual(62);
  });

  it("部活紹介と活動報告の全スレ・コメント・添付画像を保持する", () => {
    const introductionThreads = archive.threads.filter((thread) => thread.category === "club-introduction");
    const introductionComments = introductionThreads.flatMap((thread) => archive.comments[thread.id] ?? []);
    expect(introductionThreads.length).toBeGreaterThanOrEqual(15);
    expect(introductionComments.length).toBeGreaterThanOrEqual(16);
    expect([...introductionThreads, ...introductionComments].flatMap((item) => item.images ?? []).length).toBeGreaterThanOrEqual(3);

    const activityThreads = archive.threads.filter((thread) => thread.category === "club-all");
    const activityComments = activityThreads.flatMap((thread) => archive.comments[thread.id] ?? []);
    expect(activityThreads.length).toBeGreaterThanOrEqual(46);
    expect(activityComments.length).toBeGreaterThanOrEqual(61);
    expect([...activityThreads, ...activityComments].flatMap((item) => item.images ?? []).length).toBeGreaterThanOrEqual(244);
  });
});
