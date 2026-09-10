import archive from "../data/discord-benefits-2026-08-15.json";
import type { Coupon } from "../constants/mock-data";
import type { GiftCampaign } from "./gift-campaign-store";

interface RawBenefitRecord {
  index: number;
  title: string;
  rawText: string;
}

function cleanForumDescription(record: RawBenefitRecord): string {
  const titleOffset = record.rawText.indexOf(record.title);
  const afterTitle = titleOffset >= 0 ? record.rawText.slice(titleOffset + record.title.length) : record.rawText;
  const bodyStart = afterTitle.indexOf("\n:\n");
  const body = bodyStart >= 0 ? afterTitle.slice(bodyStart + 3) : afterTitle;
  return body
    .replace(/\n,\n/g, "\n\n")
    .replace(/\n@everyone(?: \(編集済\))?[\s\S]*$/, "")
    .replace(/\s*\(編集済\)[\s\S]*$/, "")
    .trim();
}

const COUPON_METADATA: Pick<Coupon, "discount" | "expiresAt" | "status" | "imageUrl">[] = [
  { discount: "美容施術16,500円分無料", expiresAt: "2099-12-31", status: "active", imageUrl: "/discord-benefits/coupon-0.webp" },
  { discount: "限定コラボコース", expiresAt: "2026-05-31", status: "ended", imageUrl: "/discord-benefits/coupon-1.webp" },
  { discount: "限定コラボコース", expiresAt: "2026-02-28", status: "ended", imageUrl: "/discord-benefits/coupon-2.webp" },
  { discount: "お会計50%OFF", expiresAt: "2024-05-31", status: "ended", imageUrl: "/discord-benefits/coupon-3.webp" },
  { discount: "プラチナ会員権", expiresAt: "2024-12-31", status: "ended" },
  { discount: "グラスワイン1杯無料", expiresAt: "2025-12-31", status: "ended" },
  { discount: "1ドリンク＋条件付き10%OFF", expiresAt: "2025-12-31", status: "ended" },
  { discount: "最大75%OFF", expiresAt: "2024-10-31", status: "ended" },
];

export function loadImportedDiscordCoupons(): Coupon[] {
  return (archive.coupons as RawBenefitRecord[]).map((record, index) => ({
    id: `discord-coupon-${index + 1}`,
    title: record.title.replace(/^【終了】/, "").trim(),
    description: cleanForumDescription(record),
    discount: COUPON_METADATA[index]?.discount ?? "会員限定特典",
    expiresAt: COUPON_METADATA[index]?.expiresAt ?? "2026-12-31",
    code: "DISCORD-ARCHIVE",
    requiredRank: "regular",
    usageType: "multiple",
    status: COUPON_METADATA[index]?.status ?? "ended",
    imageUrl: COUPON_METADATA[index]?.imageUrl,
    sourceContestId: "discord-archive",
  }));
}

const GIFT_METADATA: Pick<GiftCampaign, "winnerCount" | "deadline" | "imageUrl" | "imageEmoji">[] = [
  { winnerCount: 3, deadline: "2026-06-24", imageUrl: "/discord-benefits/gift-0.webp", imageEmoji: "🥩" },
  { winnerCount: 4, deadline: "2026-05-23", imageUrl: "/discord-benefits/gift-1.webp", imageEmoji: "🥩" },
  { winnerCount: 3, deadline: "2026-04-21", imageUrl: "/discord-benefits/gift-2.webp", imageEmoji: "🫖" },
  { winnerCount: 3, deadline: "2026-04-08", imageUrl: "/discord-benefits/gift-3.webp", imageEmoji: "🌸" },
  { winnerCount: 5, deadline: "2026-03-07", imageUrl: "/discord-benefits/gift-4.webp", imageEmoji: "🍸" },
  { winnerCount: 3, deadline: "2026-02-09", imageEmoji: "🥩" },
  { winnerCount: 3, deadline: "2026-02-20", imageEmoji: "🥩" },
  { winnerCount: 3, deadline: "2026-01-16", imageEmoji: "🍽️" },
];

export function loadImportedDiscordGiftCampaigns(): GiftCampaign[] {
  return (archive.gifts as RawBenefitRecord[])
    // 「新部活投票」はプレゼント企画ではないため、Discord上の実際の企画のみを移行する。
    .filter((record) => record.rawText.length > 100)
    .map((record, index) => ({
      id: `discord-gift-${index + 1}`,
      title: record.title.replace(/^【募集終了】/, "").trim(),
      description: cleanForumDescription(record),
      category: "gourmet",
      minimumRank: "regular",
      winnerCount: GIFT_METADATA[index]?.winnerCount ?? 1,
      deadline: GIFT_METADATA[index]?.deadline ?? "2026-01-01",
      status: "closed",
      imageEmoji: GIFT_METADATA[index]?.imageEmoji ?? "🎁",
      imageUrl: GIFT_METADATA[index]?.imageUrl,
      archivedFromDiscord: true,
    }));
}
