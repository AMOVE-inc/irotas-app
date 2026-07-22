import type { Coupon, MemberRank } from "@/constants/mock-data";

export type CouponUsage = {
  useCount: number;
  lastPresentedAt?: string;
  usedAt?: string;
};

const RANK_ORDER: MemberRank[] = ["regular", "silver", "gold", "platinum"];

export type CouponAvailability = "available" | "rank_locked" | "expired" | "used";

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCouponAvailability(
  coupon: Coupon,
  memberRank: MemberRank,
  usage: CouponUsage | undefined,
  now = new Date(),
  memberId?: string,
): CouponAvailability {
  if (coupon.recipientIds && (!memberId || !coupon.recipientIds.includes(memberId))) return "rank_locked";
  if (localDateKey(now) > coupon.expiresAt) return "expired";
  if (RANK_ORDER.indexOf(memberRank) < RANK_ORDER.indexOf(coupon.requiredRank)) return "rank_locked";
  if (coupon.usageType === "single" && usage?.usedAt) return "used";
  return "available";
}

export function formatCouponTimestamp(value?: string): string {
  if (!value) return "未提示";
  return new Date(value).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
