import type { GiftCampaign } from "./gift-campaign-store";

function tokyoDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export function isGiftCampaignOpen(
  campaign: GiftCampaign,
  now = new Date(),
): boolean {
  return campaign.status === "open" && campaign.deadline >= tokyoDateKey(now);
}
