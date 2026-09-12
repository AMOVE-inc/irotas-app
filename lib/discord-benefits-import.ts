import archive from "../data/discord-benefits-2026-08-15.json";
import giftArchive from "../data/discord-gift-posts-2026-09-12.json";
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

interface DiscordGiftPost {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  sourceImageUrl: string;
}

function giftDeadline(post: DiscordGiftPost): string {
  const match = post.body.match(/(\d{1,2})\s*[/月]\s*(\d{1,2})\s*(?:日)?[^。\n]{0,25}?(?:まで|締切|〆切)/);
  if (!match) return post.createdAt.slice(0, 10);
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return post.createdAt.slice(0, 10);
  const posted = new Date(post.createdAt);
  const year = posted.getUTCFullYear() + (month < posted.getUTCMonth() + 1 - 6 ? 1 : 0);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function giftWinnerCount(post: DiscordGiftPost): number {
  const body = post.body.match(/(?:抽選で|募集人数[^\d]{0,15})(\d+)名/);
  const title = post.title.match(/(\d+)名様/);
  return Math.max(1, Number(body?.[1] ?? title?.[1] ?? 1));
}

export function loadImportedDiscordGiftCampaigns(): GiftCampaign[] {
  return (giftArchive as DiscordGiftPost[])
    .map((post): GiftCampaign => ({
      id: `discord-gift-${post.id}`,
      title: post.title.replace(/^【募集終了】/, "").trim(),
      description: post.body.replace(/\n,\n@everyone[\s\S]*$/, "").trim(),
      category: "gourmet",
      minimumRank: "regular",
      winnerCount: giftWinnerCount(post),
      deadline: giftDeadline(post),
      status: "closed",
      imageEmoji: "🎁",
      imageUrl: post.sourceImageUrl ? `/discord-benefits/gift-${post.id}.${post.id === "1459122252984356864" ? "jpg" : "webp"}` : undefined,
      archivedFromDiscord: true,
      createdAt: post.createdAt,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
