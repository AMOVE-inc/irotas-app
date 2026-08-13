import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

export interface Campaign {
  id: string;
  title: string;
  description: string;
  targetRank: "all" | "silver" | "gold" | "platinum";
  startDate: string;
  endDate: string;
  status: "active" | "scheduled" | "ended";
  type: "points" | "event" | "gift" | "notification";
  reachCount: number;
}

const STORAGE_KEY = "managed_campaigns_v1";
export const INITIAL_CAMPAIGNS: Campaign[] = [
  { id: "c1", title: "幹事応援キャンペーン", description: "メンバー主催のグルメ会を応援します。開催完了した幹事には20ptを付与します。キャンセル時は付与対象外です。", targetRank: "all", startDate: "2026-08-01", endDate: "2026-12-31", status: "active", type: "points", reachCount: 500 },
  { id: "c2", title: "友人招待キャンペーン", description: "IRO+を一緒に楽しみたい友人をご紹介ください。紹介された方の入会完了後、運営から特典をご案内します。", targetRank: "all", startDate: "2026-08-01", endDate: "2026-12-31", status: "active", type: "notification", reachCount: 500 },
];

let campaigns = INITIAL_CAMPAIGNS;
let hydrated = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
const emit = () => listeners.forEach((listener) => listener());
const snapshot = () => campaigns;

async function hydrate() {
  if (hydrated) return;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) campaigns = JSON.parse(raw) as Campaign[];
  hydrated = true;
  emit();
}

async function save(next: Campaign[]) {
  campaigns = next;
  emit();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function useCampaigns() {
  useEffect(() => { void hydrate(); }, []);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export async function createCampaign(campaign: Campaign) { await hydrate(); await save([campaign, ...campaigns]); }
export async function updateCampaign(campaign: Campaign) { await hydrate(); await save(campaigns.map((item) => item.id === campaign.id ? campaign : item)); }
export async function setCampaignStatus(id: string, status: Campaign["status"]) { await hydrate(); await save(campaigns.map((item) => item.id === id ? { ...item, status } : item)); }
export async function deleteCampaign(id: string) { await hydrate(); await save(campaigns.filter((item) => item.id !== id)); }
