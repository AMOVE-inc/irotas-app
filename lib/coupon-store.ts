import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import type { Coupon } from "@/constants/mock-data";
import type { CouponUsage } from "@/lib/coupon-rules";
import { deleteSharedCoupon, getSharedBenefits, saveSharedCoupon, useSharedCoupon } from "./benefits-api";

const USAGE_KEY = "coupon_member_usage_v1";
const AWARDED_KEY = "coupon_awarded_v1";

type UsageByMember = Record<string, Record<string, CouponUsage>>;
const EMPTY_USAGES: Record<string, CouponUsage> = {};

// The database is authoritative. Bundled and device-cached coupons must never
// be merged into it: doing so resurrects coupons deleted by an operator.
let coupons: Coupon[] = [];
let usages: UsageByMember = {};
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getCouponsSnapshot() {
  return coupons;
}

function ensureHydrated() {
  if (hydrated) return Promise.resolve();
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = Promise.all([AsyncStorage.getItem(USAGE_KEY), getSharedBenefits()])
    .then(([savedUsage, shared]) => {
      if (savedUsage) usages = JSON.parse(savedUsage) as UsageByMember;
      coupons = shared.coupons;
      usages = { ...usages, current: shared.usages };
    })
    .then(() => {
      hydrated = true;
      emitChange();
    })
    .catch(() => {
      hydrated = true;
      emitChange();
    });
  return hydrationPromise;
}

export async function awardCoupon(coupon: Coupon): Promise<boolean> {
  await ensureHydrated();
  if (coupons.some((item) => item.id === coupon.id)) return false;
  coupons = [...coupons, coupon];
  emitChange();
  await AsyncStorage.setItem(AWARDED_KEY, JSON.stringify(coupons.filter((item) => item.sourceContestId)));
  return true;
}

export function useCoupons(): Coupon[] {
  useEffect(() => { void ensureHydrated(); }, []);
  return useSyncExternalStore(subscribe, getCouponsSnapshot, getCouponsSnapshot);
}

export function useCouponUsages(memberId: string): Record<string, CouponUsage> {
  useEffect(() => { void ensureHydrated(); }, []);
  return useSyncExternalStore(
    subscribe,
    () => usages[memberId] ?? usages.current ?? EMPTY_USAGES,
    () => usages[memberId] ?? usages.current ?? EMPTY_USAGES,
  );
}

export async function updateCouponUsageType(couponId: string, usageType: Coupon["usageType"]) {
  await ensureHydrated();
  const coupon = coupons.find((item) => item.id === couponId);
  if (!coupon) return;
  await saveSharedCoupon({ ...coupon, usageType });
  coupons = coupons.map((item) => item.id === couponId ? { ...item, usageType } : item);
  emitChange();
}

async function saveManagedCoupons() {
  emitChange();
}

export async function createCoupon(coupon: Coupon) {
  await ensureHydrated();
  await saveSharedCoupon(coupon);
  coupons = [coupon, ...coupons];
  await saveManagedCoupons();
}

export async function updateCoupon(coupon: Coupon) {
  await ensureHydrated();
  await saveSharedCoupon(coupon);
  coupons = coupons.map((item) => item.id === coupon.id ? coupon : item);
  await saveManagedCoupons();
}

export async function setCouponStatus(couponId: string, status: "active" | "ended") {
  await ensureHydrated();
  const coupon = coupons.find((item) => item.id === couponId);
  if (!coupon) return;
  await saveSharedCoupon({ ...coupon, status });
  coupons = coupons.map((item) => item.id === couponId ? { ...item, status } : item);
  await saveManagedCoupons();
}

export async function deleteCoupon(couponId: string) {
  await ensureHydrated();
  await deleteSharedCoupon(couponId);
  coupons = coupons.filter((item) => item.id !== couponId);
  await AsyncStorage.setItem(AWARDED_KEY, JSON.stringify(coupons.filter((item) => item.sourceContestId)));
  await saveManagedCoupons();
}

async function saveMemberUsage(memberId: string, couponId: string, usage: CouponUsage) {
  usages = {
    ...usages,
    [memberId]: { ...(usages[memberId] ?? {}), [couponId]: usage },
  };
  emitChange();
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(usages));
}

export async function recordCouponPresentation(memberId: string, couponId: string) {
  const shared = await useSharedCoupon(couponId, "present");
  usages = { ...usages, [memberId]: { ...(usages[memberId] ?? {}), [couponId]: shared.usage }, current: { ...(usages.current ?? {}), [couponId]: shared.usage } };
  emitChange();
  return;
  const current = usages[memberId]?.[couponId] ?? { useCount: 0 };
  await saveMemberUsage(memberId, couponId, { ...current, lastPresentedAt: new Date().toISOString() });
}

export async function redeemCoupon(memberId: string, coupon: Coupon) {
  const shared = await useSharedCoupon(coupon.id, "redeem");
  usages = { ...usages, [memberId]: { ...(usages[memberId] ?? {}), [coupon.id]: shared.usage }, current: { ...(usages.current ?? {}), [coupon.id]: shared.usage } };
  emitChange();
  return;
  const current = usages[memberId]?.[coupon.id] ?? { useCount: 0 };
  const now = new Date().toISOString();
  await saveMemberUsage(memberId, coupon.id, {
    ...current,
    useCount: current.useCount + 1,
    lastPresentedAt: now,
    usedAt: coupon.usageType === "single" ? now : current.usedAt,
  });
}
