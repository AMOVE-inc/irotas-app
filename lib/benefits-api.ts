import type { Coupon } from "../constants/mock-data";
import type { CouponUsage } from "./coupon-rules";
import type { GiftApplication, GiftCampaign } from "./gift-campaign-store";
import { sharedJsonRequest } from "./shared-request";

export type SharedBenefits = {
  memberRank: "regular" | "silver" | "gold" | "platinum";
  coupons: Coupon[];
  usages: Record<string, CouponUsage>;
  gifts: GiftCampaign[];
  applications: GiftApplication[];
  points: { balance: number; balances: Record<string, number>; history: Record<string, unknown>[] };
};

async function request<T>(path: string, init: RequestInit = {}) {
  return sharedJsonRequest<T>(path, init);
}

export const getSharedBenefits = () => request<SharedBenefits>("/api/benefits");
export const saveSharedCoupon = (coupon: Coupon) => request<{ success: true }>(`/api/benefits/coupons/${encodeURIComponent(coupon.id)}`, { method: "PUT", body: JSON.stringify(coupon) });
export const deleteSharedCoupon = (id: string) => request<{ success: true }>(`/api/benefits/coupons/${encodeURIComponent(id)}`, { method: "DELETE" });
export const useSharedCoupon = (id: string, action: "present" | "redeem") => request<{ success: true; usage: CouponUsage }>(`/api/benefits/coupons/${encodeURIComponent(id)}/${action}`, { method: "POST" });
export const saveSharedGift = (gift: GiftCampaign) => request<{ success: true }>(`/api/benefits/gifts/${encodeURIComponent(gift.id)}`, { method: "PUT", body: JSON.stringify(gift) });
export const deleteSharedGift = (id: string) => request<{ success: true }>(`/api/benefits/gifts/${encodeURIComponent(id)}`, { method: "DELETE" });
export const applyForSharedGift = (id: string) => request<{ success: true; alreadyApplied: boolean }>(`/api/benefits/gifts/${encodeURIComponent(id)}/apply`, { method: "POST" });
export const runSharedGiftLottery = (id: string) => request<{ success: true; winnerIds: string[] }>(`/api/benefits/gifts/${encodeURIComponent(id)}/lottery`, { method: "POST" });
export const adjustSharedIrotasPoints = (input: { amount: number; reason: string; idempotencyKey: string; memberId?: string }) => request<{ success: true; balance: number; duplicate?: boolean; transactionId?: string }>("/api/benefits/points/adjust", { method: "POST", body: JSON.stringify(input) });
