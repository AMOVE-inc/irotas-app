import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadImportedDiscordCoupons, loadImportedDiscordGiftCampaigns } from "../lib/discord-benefits-import";
import { inferImportedRecruitmentStatus, sortRecruitmentThreads } from "../lib/board-recruitment";
import { stripLegacyClubApplicationBlock } from "../lib/discord-board-import";
import { MEMBERS, type BoardThread } from "../constants/mock-data";

describe("Discord benefit migration", () => {
  it("imports the actual coupon and gift campaign archives", () => {
    const coupons = loadImportedDiscordCoupons();
    const gifts = loadImportedDiscordGiftCampaigns();
    expect(coupons).toHaveLength(8);
    expect(gifts).toHaveLength(56);
    expect(coupons[0].title).toContain("美容クリニック");
    expect(coupons[0].description).toContain("TIAM CLINIC");
    expect(gifts[0].title).toContain("西麻布");
    expect(gifts[1].title).toContain("焼肉うしみつ一門");
    expect(gifts[0].createdAt! > gifts[1].createdAt!).toBe(true);
    expect(new Set(gifts.map((gift) => gift.id)).size).toBe(56);
    expect(gifts.filter((gift) => gift.imageUrl)).toHaveLength(51);
    expect(gifts.every((gift) => !gift.imageUrl || existsSync(join(process.cwd(), "public", gift.imageUrl)))).toBe(true);
  });
});

describe("board recruitment status", () => {
  it("supports open, closed, and no badge states", () => {
    expect(inferImportedRecruitmentStatus("free-chat", "参加者募集中", "あと2名")).toBe("open");
    expect(inferImportedRecruitmentStatus("free-chat", "募集終了", "締め切りました")).toBe("closed");
    expect(inferImportedRecruitmentStatus("free-chat", "おすすめのお店", "共有します")).toBe("none");
  });

  it("sorts open posts first and all other posts by last comment time", () => {
    const base: BoardThread = { id: "base", title: "投稿", author: MEMBERS[0], category: "free-chat", commentCount: 0, lastUpdated: "2026-01-01T00:00:00Z", preview: "", isRecruiting: false };
    const threads = sortRecruitmentThreads([
      { ...base, id: "closed", recruitmentStatus: "closed", lastUpdated: "2026-01-03T00:00:00Z" },
      { ...base, id: "open", recruitmentStatus: "open", isRecruiting: true },
      { ...base, id: "none", recruitmentStatus: "none", lastUpdated: "2026-01-02T00:00:00Z" },
    ]);
    expect(threads.map((thread) => thread.id)).toEqual(["open", "closed", "none"]);
  });
});

describe("club introduction migration", () => {
  it("removes the old Google Form and Discord chat guidance", () => {
    const source = `部活の紹介です。\n\n**📝 入部申請フォーム**\n入部希望の方は、下記フォームよりお申し込みください。\n**https://docs.google.com/forms/d/e/example/viewform**\n\n**🔒 部員専用チャット**\n入会後はこちらの部員専用チャットを使用します。\n**https://discord.com/channels/1/2**`;
    const cleaned = stripLegacyClubApplicationBlock(source);
    expect(cleaned).toBe("部活の紹介です。");
  });
});
