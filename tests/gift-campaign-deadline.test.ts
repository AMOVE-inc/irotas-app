import { describe, expect, it } from "vitest";
import { isGiftCampaignOpen } from "../lib/gift-campaign-status";
import type { GiftCampaign } from "../lib/gift-campaign-store";

const campaign: GiftCampaign = {
  id: "gift-test",
  title: "テスト企画",
  description: "",
  category: "gourmet",
  minimumRank: "regular",
  winnerCount: 1,
  deadline: "2026-08-20",
  status: "open",
  imageEmoji: "🎁",
};

describe("isGiftCampaignOpen", () => {
  it("締切当日までは募集中として扱う", () => {
    expect(isGiftCampaignOpen(campaign, new Date("2026-08-20T14:59:59Z"))).toBe(
      true,
    );
  });

  it("東京時間で締切翌日になったら募集終了として扱う", () => {
    expect(isGiftCampaignOpen(campaign, new Date("2026-08-20T15:00:00Z"))).toBe(
      false,
    );
  });

  it("管理画面で終了した企画は締切前でも募集終了として扱う", () => {
    expect(
      isGiftCampaignOpen(
        { ...campaign, status: "closed", deadline: "2026-12-31" },
        new Date("2026-08-20T00:00:00Z"),
      ),
    ).toBe(false);
  });
});
