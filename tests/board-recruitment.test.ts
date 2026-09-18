import { describe, expect, it } from "vitest";
import { displayBoardThreadTitle, inferImportedRecruitment, isBoardThreadClosed, isClubSelfIntroduction, isRecruitmentBoardCategory, isThreadPinned, sortRecruitmentThreads } from "../lib/board-recruitment";
import { parseDiscordRichLines, parseDiscordHeading, tokenizeRichTextLinks } from "../lib/discord-rich-text";
import type { BoardThread } from "../constants/mock-data";

describe("Discord掲示板表示", () => {
  it("#を大見出し、##と###を中見出しとして解析する", () => {
    expect(parseDiscordHeading("# 大見出し")).toEqual({ level: 1, content: "大見出し" });
    expect(parseDiscordHeading("## 中見出し")).toEqual({ level: 2, content: "中見出し" });
    expect(parseDiscordHeading("### 小見出し扱い")).toEqual({ level: 3, content: "小見出し扱い" });
  });

  it("複数行の太字と見出しを同時に解析する", () => {
    const lines = parseDiscordRichLines("@everyone\n\n## 📣 今週のニュース\n**1行目\n2行目**\n## 次の項目");
    expect(lines[2]).toEqual({ level: 2, segments: [{ text: "📣 今週のニュース", formats: [] }] });
    expect(lines[3]).toEqual({ level: 0, segments: [{ text: "1行目", formats: ["bold"] }] });
    expect(lines[4]).toEqual({ level: 0, segments: [{ text: "2行目", formats: ["bold"] }] });
    expect(lines[5]).toEqual({ level: 2, segments: [{ text: "次の項目", formats: [] }] });
  });

  it("太字の途中にある見出しも認識する", () => {
    expect(parseDiscordRichLines("**前の行\n# 大見出し\n後の行**")[1])
      .toEqual({ level: 1, segments: [{ text: "大見出し", formats: ["bold"] }] });
  });

  it("見出しと同じ投稿内の複数の太字で記号を残さない", () => {
    const lines = parseDiscordRichLines("@everyone\n\n## 1. 新アプリについて\n**プロフィール設定**をお願いします\n\n## 2. IRO+Party\n**募集開始**です");
    expect(lines[2].level).toBe(2);
    expect(lines[5].level).toBe(2);
    expect(lines.flatMap((line) => line.segments).map((segment) => segment.text).join("")).not.toContain("**");
    expect(lines[3].segments[0]).toEqual({ text: "プロフィール設定", formats: ["bold"] });
  });

  it("古い投稿の見出し末尾にある孤立した太字記号を後続の太字に結び付けない", () => {
    const lines = parseDiscordRichLines("## 2. 10/14(水)19:30〜IRO+Party**\n明日から募集します\n\n## 3. 今週のテーマは**「お好み焼き」**");
    expect(lines[0]).toEqual({ level: 2, segments: [{ text: "2. 10/14(水)19:30〜IRO+Party", formats: [] }] });
    expect(lines[3]).toEqual({ level: 2, segments: [
      { text: "3. 今週のテーマは", formats: [] },
      { text: "「お好み焼き」", formats: ["bold"] },
    ] });
  });

  it("MarkdownリンクとURLをリンクとして抽出する", () => {
    expect(tokenizeRichTextLinks("[食べログ](https://tabelog.com/a) を確認")[0]).toMatchObject({ type: "link", label: "食べログ", url: "https://tabelog.com/a" });
    expect(tokenizeRichTextLinks("地図 https://maps.app.goo.gl/abc。 ")[1]).toMatchObject({ type: "link", url: "https://maps.app.goo.gl/abc", suffix: "。" });
  });
});

describe("掲示板募集ステータス", () => {
  it("なんでも掲示板と個別部活だけを対象にする", () => {
    expect(isRecruitmentBoardCategory("free-chat")).toBe(true);
    expect(isRecruitmentBoardCategory("club-club-wine")).toBe(true);
    expect(isRecruitmentBoardCategory("club-all")).toBe(false);
  });

  it("過去投稿の明示された募集状態を推定する", () => {
    expect(inferImportedRecruitment("free-chat", "参加者募集", "あと2名です")).toBe(true);
    expect(inferImportedRecruitment("club-club-wine", "ワイン会", "募集終了しました")).toBe(false);
  });

  it("通常投稿をクローズ済み投稿より上に並べる", () => {
    const base = { author: {} as BoardThread["author"], commentCount: 0, preview: "", category: "free-chat" };
    const closed = { ...base, id: "closed", title: "closed", isRecruiting: false, lastUpdated: "2026-08-15T10:00:00Z" } as BoardThread;
    const open = { ...base, id: "open", title: "open", isRecruiting: true, lastUpdated: "2026-08-14T10:00:00Z" } as BoardThread;
    expect(sortRecruitmentThreads([closed, open]).map((item) => item.id)).toEqual(["open", "closed"]);
  });

  it("クローズ状態を切り替えてもタイトルを変更しない", () => {
    const base = { author: {} as BoardThread["author"], commentCount: 0, preview: "", category: "free-chat", lastUpdated: "2026-08-15T10:00:00Z" };
    const closed = { ...base, id: "closed", title: "【終了】映画会", recruitmentStatus: "closed", isRecruiting: false } as BoardThread;
    const imported = { ...base, id: "imported", title: "【募集終了】映画会", recruitmentStatus: "closed", isRecruiting: false } as BoardThread;
    expect(isBoardThreadClosed(closed)).toBe(true);
    expect(displayBoardThreadTitle(closed)).toBe("【終了】映画会");
    expect(displayBoardThreadTitle(imported)).toBe("【募集終了】映画会");
  });

  it("部活の固定済み自己紹介を最上部に表示する", () => {
    const base = { author: {} as BoardThread["author"], commentCount: 0, preview: "", category: "club-club-wine" };
    const open = { ...base, id: "open", title: "ワイン会", isRecruiting: true, lastUpdated: "2026-08-15T10:00:00Z" } as BoardThread;
    const introduction = { ...base, id: "intro", title: "ワイン部 自己紹介", isRecruiting: false, lastUpdated: "2026-01-01T10:00:00Z" } as BoardThread;
    expect(isClubSelfIntroduction(introduction)).toBe(true);
    expect(isThreadPinned(introduction)).toBe(true);
    expect(sortRecruitmentThreads([open, introduction]).map((item) => item.id)).toEqual(["intro", "open"]);
  });

  it("クローズ済みの固定投稿は通常投稿の区切りより下に表示する", () => {
    const base = { author: {} as BoardThread["author"], commentCount: 0, preview: "", category: "club-club-wine" };
    const open = { ...base, id: "open", title: "ワイン会", recruitmentStatus: "open" as const, lastUpdated: "2026-08-14T10:00:00Z" } as BoardThread;
    const closedPinned = { ...base, id: "closed-pinned", title: "締め切った会", recruitmentStatus: "closed" as const, isPinned: true, lastUpdated: "2026-08-15T10:00:00Z" } as BoardThread;
    expect(sortRecruitmentThreads([closedPinned, open]).map((item) => item.id)).toEqual(["open", "closed-pinned"]);
  });

  it("同じ募集状態では固定投稿を最上部に表示する", () => {
    const base = { author: {} as BoardThread["author"], commentCount: 0, preview: "", category: "free-chat", recruitmentStatus: "open" as const };
    const older = { ...base, id: "older", title: "older", lastUpdated: "2026-08-14T10:00:00Z" } as BoardThread;
    const newer = { ...base, id: "newer", title: "newer", lastUpdated: "2026-08-16T10:00:00Z" } as BoardThread;
    const pinned = { ...base, id: "pinned", title: "pinned", isPinned: true, lastUpdated: "2026-08-13T10:00:00Z" } as BoardThread;
    expect(sortRecruitmentThreads([older, pinned, newer]).map((item) => item.id)).toEqual(["pinned", "newer", "older"]);
  });

  it("募集掲示板以外でも固定投稿を最上部に表示する", () => {
    const base = { author: {} as BoardThread["author"], commentCount: 0, preview: "", category: "announcements" };
    const newer = { ...base, id: "newer", title: "newer", lastUpdated: "2026-08-16T10:00:00Z" } as BoardThread;
    const pinned = { ...base, id: "pinned", title: "pinned", isPinned: true, lastUpdated: "2026-08-13T10:00:00Z" } as BoardThread;
    expect(sortRecruitmentThreads([newer, pinned]).map((item) => item.id)).toEqual(["pinned", "newer"]);
  });
});
