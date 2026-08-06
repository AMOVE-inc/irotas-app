import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MemberRank } from "@/constants/mock-data";

export type GiftCategory = "gourmet" | "non_gourmet";
export type GiftStatus = "open" | "closed";

export interface GiftCampaign {
  id: string;
  title: string;
  description: string;
  category: GiftCategory;
  minimumRank: MemberRank;
  winnerCount: number;
  deadline: string;
  status: GiftStatus;
  imageEmoji: string;
}

export interface GiftApplication {
  id: string;
  campaignId: string;
  memberId: string;
  memberName: string;
  appliedAt: string;
  result: "pending" | "winner" | "not_selected";
}

const CAMPAIGNS_KEY = "gift_campaigns_v2";
const APPLICATIONS_KEY = "gift_campaign_applications_v2";

export const INITIAL_GIFT_CAMPAIGNS: GiftCampaign[] = [
  { id: "g1", title: "高級レストラン ペアディナー券", description: "都内レストランのペアディナーへご招待します。", category: "gourmet", minimumRank: "gold", winnerCount: 3, deadline: "2026-08-31", status: "open", imageEmoji: "🍽️" },
  { id: "g2", title: "ソムリエ厳選ワインセット", description: "厳選したワイン3本セットをプレゼントします。", category: "gourmet", minimumRank: "silver", winnerCount: 5, deadline: "2026-08-25", status: "open", imageEmoji: "🍷" },
  { id: "g3", title: "IRO+ オリジナルグッズ", description: "トートバッグとタンブラーのセットです。", category: "non_gourmet", minimumRank: "regular", winnerCount: 10, deadline: "2026-08-20", status: "open", imageEmoji: "🎁" },
  { id: "g4", title: "温泉旅行ペアチケット", description: "1泊2日の温泉旅行をプレゼントします。", category: "non_gourmet", minimumRank: "platinum", winnerCount: 1, deadline: "2026-07-31", status: "closed", imageEmoji: "♨️" },
];

export async function getGiftCampaigns(): Promise<GiftCampaign[]> {
  const raw = await AsyncStorage.getItem(CAMPAIGNS_KEY);
  return raw ? (JSON.parse(raw) as GiftCampaign[]) : INITIAL_GIFT_CAMPAIGNS;
}

export async function saveGiftCampaigns(campaigns: GiftCampaign[]): Promise<void> {
  await AsyncStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
}

export async function getGiftApplications(): Promise<GiftApplication[]> {
  const raw = await AsyncStorage.getItem(APPLICATIONS_KEY);
  return raw ? (JSON.parse(raw) as GiftApplication[]) : [];
}

export async function applyForGift(campaignId: string, memberId: string, memberName: string): Promise<GiftApplication[]> {
  const applications = await getGiftApplications();
  if (applications.some((item) => item.campaignId === campaignId && item.memberId === memberId)) return applications;
  const next: GiftApplication[] = [{
    id: `gift_application_${Date.now()}`,
    campaignId,
    memberId,
    memberName,
    appliedAt: new Date().toISOString(),
    result: "pending",
  }, ...applications];
  await AsyncStorage.setItem(APPLICATIONS_KEY, JSON.stringify(next));
  return next;
}

export async function confirmGiftLottery(campaignId: string, winnerCount: number): Promise<GiftApplication[]> {
  const applications = await getGiftApplications();
  const candidates = applications
    .filter((item) => item.campaignId === campaignId && item.result === "pending")
    .sort(() => Math.random() - 0.5);
  const winnerIds = new Set(candidates.slice(0, winnerCount).map((item) => item.id));
  const next = applications.map((item): GiftApplication => item.campaignId !== campaignId ? item : {
    ...item,
    result: winnerIds.has(item.id) ? "winner" : "not_selected",
  });
  await AsyncStorage.setItem(APPLICATIONS_KEY, JSON.stringify(next));
  const campaigns = await getGiftCampaigns();
  await saveGiftCampaigns(campaigns.map((item) => item.id === campaignId ? { ...item, status: "closed" } : item));
  return next;
}
