import { describe, expect, it } from "vitest";
import { loadDiscordBoardArchive } from "../lib/discord-board-import";

describe("Discord board archive", () => {
  const archive = loadDiscordBoardArchive();

  it("対象4種類を新しい掲示板カテゴリへ移行する", () => {
    const categories = new Set(archive.threads.map((thread) => thread.category));
    expect(categories).toContain("introduction");
    expect(categories).toContain("meal-report");
    expect(categories).toContain("gourmet-advice");
    expect([...categories].some((category) => category.startsWith("club-club-"))).toBe(true);
  });

  it("excludes operator announcements misclassified as one-star meal reports", () => {
    const archive = loadDiscordBoardArchive();
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
});
