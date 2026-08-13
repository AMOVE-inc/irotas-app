import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import { COUPONS, type Coupon } from "@/constants/mock-data";
import type { CouponUsage } from "@/lib/coupon-rules";

const CONFIG_KEY = "coupon_usage_types_v1";
const USAGE_KEY = "coupon_member_usage_v1";
const AWARDED_KEY = "coupon_awarded_v1";
const MANAGED_KEY = "coupon_managed_v2";

type UsageByMember = Record<string, Record<string, CouponUsage>>;
const EMPTY_USAGES: Record<string, CouponUsage> = {};

let coupons: Coupon[] = COUPONS.map((coupon) => ({ ...coupon }));
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
  hydrationPromise = Promise.all([AsyncStorage.getItem(CONFIG_KEY), AsyncStorage.getItem(USAGE_KEY), AsyncStorage.getItem(AWARDED_KEY), AsyncStorage.getItem(MANAGED_KEY)])
    .then(([savedConfig, savedUsage, savedAwarded, savedManaged]) => {
      if (savedManaged) {
        const managed = JSON.parse(savedManaged) as Coupon[];
        coupons = managed.map((item) => ({ ...item, imageUrl: item.imageUrl ?? COUPONS.find((seed) => seed.id === item.id)?.imageUrl }));
      }
      if (savedConfig) {
        const config = JSON.parse(savedConfig) as Record<string, Coupon["usageType"]>;
        coupons = coupons.map((coupon) => ({ ...coupon, usageType: config[coupon.id] ?? coupon.usageType }));
      }
      if (savedUsage) usages = JSON.parse(savedUsage) as UsageByMember;
      if (savedAwarded) {
        const awarded = JSON.parse(savedAwarded) as Coupon[];
        const ids = new Set(coupons.map((coupon) => coupon.id));
        coupons = [...coupons, ...awarded.filter((coupon) => !ids.has(coupon.id))];
      }
      hydrated = true;
      emitChange();
    })
    .catch(() => {
      hydrated = true;
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
    () => usages[memberId] ?? EMPTY_USAGES,
    () => usages[memberId] ?? EMPTY_USAGES,
  );
}

export async function updateCouponUsageType(couponId: string, usageType: Coupon["usageType"]) {
  coupons = coupons.map((coupon) => (coupon.id === couponId ? { ...coupon, usageType } : coupon));
  emitChange();
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(Object.fromEntries(coupons.map((coupon) => [coupon.id, coupon.usageType]))));
}

async function saveManagedCoupons() {
  emitChange();
  await AsyncStorage.setItem(MANAGED_KEY, JSON.stringify(coupons));
}

export async function createCoupon(coupon: Coupon) {
  await ensureHydrated();
  coupons = [coupon, ...coupons];
  await saveManagedCoupons();
}

export async function updateCoupon(coupon: Coupon) {
  await ensureHydrated();
  coupons = coupons.map((item) => item.id === coupon.id ? coupon : item);
  await saveManagedCoupons();
}

export async function setCouponStatus(couponId: string, status: "active" | "ended") {
  await ensureHydrated();
  coupons = coupons.map((item) => item.id === couponId ? { ...item, status } : item);
  await saveManagedCoupons();
}

export async function deleteCoupon(couponId: string) {
  await ensureHydrated();
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
  const current = usages[memberId]?.[couponId] ?? { useCount: 0 };
  await saveMemberUsage(memberId, couponId, { ...current, lastPresentedAt: new Date().toISOString() });
}

export async function redeemCoupon(memberId: string, coupon: Coupon) {
  const current = usages[memberId]?.[coupon.id] ?? { useCount: 0 };
  const now = new Date().toISOString();
  await saveMemberUsage(memberId, coupon.id, {
    ...current,
    useCount: current.useCount + 1,
    lastPresentedAt: now,
    usedAt: coupon.usageType === "single" ? now : current.usedAt,
  });
}
