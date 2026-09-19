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
    expect(categories).toContain("free-chat");
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

  it("DiscordコメントIDの別表記を同じコメントとして表示する", () => {
    const comments = archive.comments["discord-board-1228721098716221502"] ?? [];
    expect(comments.filter((comment) => comment.content.includes("心強いです、、！"))).toHaveLength(1);
  });

  it("Discordの終了済み投票を内部項目名ではなく投票結果として表示する", () => {
    const importedComments = Object.values(archive.comments).flat();
    const importedPolls = importedComments.filter((comment) => comment.importedPollSummary);
    expect(importedPolls.length).toBeGreaterThan(0);
    expect(importedComments.every((comment) => !comment.content.includes("poll_question_text:"))).toBe(true);
    expect(importedPolls.every((comment) => comment.content === "")).toBe(true);
    expect(importedPolls.find((comment) => comment.importedPollSummary?.question === "都合の良い日を教えてください🧞‍♂️")?.importedPollSummary).toEqual({
      question: "都合の良い日を教えてください🧞‍♂️",
      winnerVotes: 1,
      totalVotes: 2,
    });
    expect(importedPolls.find((comment) => comment.importedPollSummary?.question === "参加可能な日を教えてください（複数選択可）")?.importedPollSummary).toEqual({
      question: "参加可能な日を教えてください（複数選択可）",
      winnerText: "11/15(日)昼",
      winnerVotes: 9,
      totalVotes: 39,
    });
  });

  it("MBTIアンケートの空の投票コメントにDiscordの結果を結び付ける", () => {
    const comments = archive.comments["discord-board-1471860816906158080"] ?? [];
    const polls = comments.filter((comment) => comment.importedPollSummary);
    expect(polls).toHaveLength(5);
    expect(polls.map((comment) => comment.id)).toEqual([
      "discord-comment-1471861104626896906",
      "discord-comment-1471861786050302013",
      "discord-comment-1471862232043356377",
      "discord-comment-1471862499623305283",
      "discord-comment-1471862732667097149",
    ]);
    expect(polls.map((comment) => comment.importedPollSummary)).toEqual([
      { question: "MBTIの色は？", winnerText: "緑🟩", winnerVotes: 41, totalVotes: 84 },
      { question: "紫の人！何ですか？🟪", winnerText: "ENTJ", winnerVotes: 5, totalVotes: 13 },
      { question: "緑の人！何ですか？🟩", winnerText: "ENFP", winnerVotes: 16, totalVotes: 40 },
      { question: "青の人！何ですか？🟦", winnerText: "ESFJ", winnerVotes: 10, totalVotes: 19 },
      { question: "黄色の人！何ですか？🟨", winnerVotes: 3, totalVotes: 11 },
    ]);
    expect(comments).toHaveLength(6);
  });

  it("共有編集後の募集ステータス・本文を移行元より優先する", () => {
    const original = rawArchive.threads.find((thread) => thread.id === "discord-board-1228721098716221502")!;
    const result = parseDiscordBoardArchive({ threads: [original], comments: [], threadOverrides: {
      [original.id]: { title: "編集後", content: "編集された本文", status: "closed", pinned: true, updatedAt: "2026-09-12T12:00:00Z" },
    } });
    expect(result.threads[0]).toMatchObject({ title: "編集後", preview: "編集された本文", recruitmentStatus: "closed", isPinned: true });
    expect(result.threads[0].lastUpdated).toBe(original.createdAt);
  });

  it("DiscordユーザーID単位で投稿者のアバターとロールを全投稿へ反映する", () => {
    const pokohide = archive.threads.find((thread) => thread.author.name === "pokohide");
    const nori = archive.threads.find((thread) => thread.author.name.startsWith("nori"));
    expect(pokohide?.author.rank).toBe("gold");
    expect(pokohide?.author.avatar).toContain("cdn.discordapp.com/avatars/804712649598042172/");
    expect(nori?.author.rank).toBe("platinum");
    expect(nori?.author.avatar).toContain("cdn.discordapp.com/avatars/1228678386902372374/");
  });

  it("自己紹介・ごちそうさま・相談室を新テンプレへ変換する", () => {
    expect(archive.threads.find((thread) => thread.category === "introduction")?.selfIntroduction).toBeTruthy();
    expect(archive.threads.find((thread) => thread.category === "meal-report")?.mealReport).toBeTruthy();
    expect(archive.threads.find((thread) => thread.category === "gourmet-advice")?.gourmetAdvice).toBeTruthy();
  });

  it("移行告知直前の3件の自己紹介も掲載する", () => {
    const introductions = [
      ["discord-board-1548262999624650803", "星愛", "せいあ"],
      ["discord-board-1548555037813383239", "An", "杏奈"],
      ["discord-board-1548671681944490047", "ka_no", "かーの"],
    ];
    for (const [id, author, name] of introductions) {
      const thread = archive.threads.find((item) => item.id === id);
      expect(thread).toMatchObject({ category: "introduction", author: { name: author } });
      expect(thread?.selfIntroduction?.introduction).toContain(`名前：${name}`);
    }
  });

  it("移行したカスタムスタンプをDiscord画像として保持する", () => {
    const henderson = archive.threads.find((thread) => thread.id === "discord-board-1547395669915078667");
    expect(Object.keys(henderson?.reactions ?? {})).toEqual(expect.arrayContaining([
      "💖",
      "<:emoji_6:1458869550471975023>",
      "<:emoji_11:1458869693862510645>",
    ]));
    expect(Object.keys(henderson?.reactions ?? {})).not.toContain("emoji_6");
  });

  it("グルメ相談室の全スレ・コメント・添付画像を保持する", () => {
    const adviceThreads = archive.threads.filter((thread) => thread.category === "gourmet-advice");
    const adviceComments = adviceThreads.flatMap((thread) => archive.comments[thread.id] ?? []);
    expect(adviceThreads.length).toBeGreaterThanOrEqual(50);
    expect(adviceComments.length).toBeGreaterThanOrEqual(375);
    expect(adviceComments.flatMap((comment) => comment.images ?? []).length).toBeGreaterThanOrEqual(62);
  });

  it("なんでも掲示板の全スレ・コメントを表示用カテゴリへ正規化する", () => {
    const freeThreads = archive.threads.filter((thread) => thread.category === "free-chat");
    const freeComments = freeThreads.flatMap((thread) => archive.comments[thread.id] ?? []);
    expect(freeThreads.length).toBeGreaterThanOrEqual(150);
    expect(freeComments.length).toBeGreaterThanOrEqual(2_500);
    const eventBoardIds = new Set(rawArchive.threads.filter((thread) =>
      thread.category === "gourmet-board-kanto" || thread.category === "gourmet-board-kansai",
    ).map((thread) => thread.id));
    expect(freeThreads.some((thread) => eventBoardIds.has(thread.id))).toBe(false);
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
