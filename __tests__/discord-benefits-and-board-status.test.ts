import { describe, expect, it } from "vitest";
import { loadImportedDiscordCoupons, loadImportedDiscordGiftCampaigns } from "../lib/discord-benefits-import";
import { inferImportedRecruitmentStatus, sortRecruitmentThreads } from "../lib/board-recruitment";
import { stripLegacyClubApplicationBlock } from "../lib/discord-board-import";
import { MEMBERS, type BoardThread } from "../constants/mock-data";

describe("Discord benefit migration", () => {
  it("imports the actual coupon and gift campaign archives", () => {
    const coupons = loadImportedDiscordCoupons();
    const gifts = loadImportedDiscordGiftCampaigns();
    expect(coupons).toHaveLength(8);
    expect(gifts).toHaveLength(8);
    expect(coupons[0].title).toContain("美容クリニック");
    expect(coupons[0].description).toContain("TIAM CLINIC");
    expect(gifts[0].title).toContain("焼肉うしみつ一門");
    expect(gifts[0].description).toContain("抽選で3名様");
  });
});

describe("board recruitment status", () => {
  it("supports open, closed, and no badge states", () => {
    expect(inferImportedRecruitmentStatus("free-chat", "参加者募集中", "あと2名")).toBe("open");
    expect(inferImportedRecruitmentStatus("free-chat", "募集終了", "締め切りました")).toBe("closed");
    expect(inferImportedRecruitmentStatus("free-chat", "おすすめのお店", "共有します")).toBe("none");
  });

  it("sorts open posts before neutral and closed posts", () => {
    const base: BoardThread = { id: "base", title: "投稿", author: MEMBERS[0], category: "free-chat", commentCount: 0, lastUpdated: "2026-01-01T00:00:00Z", preview: "", isRecruiting: false };
    const threads = sortRecruitmentThreads([
      { ...base, id: "closed", recruitmentStatus: "closed" },
      { ...base, id: "open", recruitmentStatus: "open", isRecruiting: true },
      { ...base, id: "none", recruitmentStatus: "none" },
    ]);
    expect(threads.map((thread) => thread.id)).toEqual(["open", "none", "closed"]);
  });
});

describe("club introduction migration", () => {
  it("removes the old Google Form and Discord chat guidance", () => {
    const source = `部活の紹介です。\n\n**📝 入部申請フォーム**\n入部希望の方は、下記フォームよりお申し込みください。\n**https://docs.google.com/forms/d/e/example/viewform**\n\n**🔒 部員専用チャット**\n入会後はこちらの部員専用チャットを使用します。\n**https://discord.com/channels/1/2**`;
    const cleaned = stripLegacyClubApplicationBlock(source);
    expect(cleaned).toBe("部活の紹介です。");
  });
});

