import { describe, expect, it } from "vitest";
import { inferImportedRecruitment, isClubSelfIntroduction, isRecruitmentBoardCategory, isThreadPinned, sortRecruitmentThreads } from "../lib/board-recruitment";
import { parseDiscordHeading, tokenizeRichTextLinks } from "../lib/discord-rich-text";
import type { BoardThread } from "../constants/mock-data";

describe("Discord掲示板表示", () => {
  it("#を大見出し、##と###を中見出しとして解析する", () => {
    expect(parseDiscordHeading("# 大見出し")).toEqual({ level: 1, content: "大見出し" });
    expect(parseDiscordHeading("## 中見出し")).toEqual({ level: 2, content: "中見出し" });
    expect(parseDiscordHeading("### 小見出し扱い")).toEqual({ level: 3, content: "小見出し扱い" });
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

  it("募集中を募集終了より上に並べる", () => {
    const base = { author: {} as BoardThread["author"], commentCount: 0, preview: "", category: "free-chat" };
    const closed = { ...base, id: "closed", title: "closed", isRecruiting: false, lastUpdated: "2026-08-15T10:00:00Z" } as BoardThread;
    const open = { ...base, id: "open", title: "open", isRecruiting: true, lastUpdated: "2026-08-14T10:00:00Z" } as BoardThread;
    expect(sortRecruitmentThreads([closed, open]).map((item) => item.id)).toEqual(["open", "closed"]);
  });

  it("部活の自己紹介を自動で固定し募集状態の上にも表示する", () => {
    const base = { author: {} as BoardThread["author"], commentCount: 0, preview: "", category: "club-club-wine" };
    const open = { ...base, id: "open", title: "ワイン会", isRecruiting: true, lastUpdated: "2026-08-15T10:00:00Z" } as BoardThread;
    const introduction = { ...base, id: "intro", title: "ワイン部 自己紹介", isRecruiting: false, lastUpdated: "2026-01-01T10:00:00Z" } as BoardThread;
    expect(isClubSelfIntroduction(introduction)).toBe(true);
    expect(isThreadPinned(introduction)).toBe(true);
    expect(sortRecruitmentThreads([open, introduction]).map((item) => item.id)).toEqual(["intro", "open"]);
  });
});
