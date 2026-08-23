import type { Coupon } from "../constants/mock-data";
import type { CouponUsage } from "./coupon-rules";
import type { GiftApplication, GiftCampaign } from "./gift-campaign-store";

export type SharedBenefits = {
  memberRank: "regular" | "silver" | "gold" | "platinum";
  coupons: Coupon[];
  usages: Record<string, CouponUsage>;
  gifts: GiftCampaign[];
  applications: GiftApplication[];
  points: { balance: number; balances: Record<string, number>; history: Array<Record<string, unknown>> };
};

async function request<T>(path: string, init: RequestInit = {}) {
  let url = path;
  const headers: Record<string, string> = { "content-type": "application/json", ...(init.headers as Record<string, string> ?? {}) };
  if (typeof window === "undefined" && typeof navigator !== "undefined") {
    const base = process.env.EXPO_PUBLIC_API_BASE_URL ?? process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "";
    url = `${base.replace(/\/$/, "")}${path}`;
    const token = await import("./_core/auth").then((module) => module.getSessionToken());
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(value.error ?? "サーバー処理に失敗しました");
  }
  return response.json() as Promise<T>;
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
