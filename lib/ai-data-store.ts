import AsyncStorage from "@react-native-async-storage/async-storage";

export type DayType = "weekday" | "saturday" | "sunday_holiday" | "irregular";
export type TimeSlot = "lunch" | "afternoon" | "dinner" | "late_night";
export type GroupSize = "small" | "medium" | "large" | "any";
export type PreferredEventType = "regular_dining" | "hard_to_book" | "chef_collaboration" | "wine" | "sweets" | "travel" | "club_activity" | "party";
export type ParticipationGoal = "food_discovery" | "make_friends" | "find_hobby_friends" | "new_experiences" | "networking" | "learn_about_food";
export type SoloComfort = "comfortable" | "slightly_anxious" | "prefer_with_friend";

export interface MemberPreferences {
  preferredAreas: string[];
  favoriteCuisineKeys: string[];
  budgetMinYen: number | null;
  budgetMaxYen: number | null;
  availableDayTypes: DayType[];
  availableTimeSlots: TimeSlot[];
  preferredGroupSizes: GroupSize[];
  preferredEventTypes: PreferredEventType[];
  participationGoals: ParticipationGoal[];
  soloParticipationComfort: SoloComfort | null;
  newMemberWelcome: boolean;
  completedAt: string | null;
  updatedAt: string;
}

export interface MemberSafetyPreferences {
  allergyText: string;
  dislikedFoods: string;
  dietaryRestrictions: string;
  severity: "none" | "mild" | "moderate" | "severe";
  shareWithOrganizer: boolean;
  confirmedAt: string | null;
}

export interface MemberAiConsents {
  eventRecommendation: boolean;
  memberMatching: boolean;
  conciergeHistory: boolean;
  anonymousImprovement: boolean;
  updatedAt: string;
}

export type ActivityEventName =
  | "profile_completed"
  | "event_viewed"
  | "event_favorited"
  | "event_applied"
  | "event_confirmed"
  | "recommendation_shown"
  | "recommendation_clicked"
  | "event_feedback_submitted"
  | "exit_survey_submitted";

export interface MemberActivityEvent {
  id: string;
  userId: string;
  eventName: ActivityEventName;
  entityType?: "event" | "profile" | "recommendation" | "survey";
  entityId?: string;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface EventFeedback {
  eventId: string;
  userId: string;
  overallRating: number;
  foodRating: number;
  venueRating: number;
  communityRating: number;
  wouldAttendAgain: boolean;
  goodTags: string[];
  improvementTags: string[];
  comment: string;
  submittedAt: string;
}

const key = (section: string, userId: string) => `irotas_ai_${section}_${userId}`;
const ACTIVITY_KEY = "irotas_ai_activity_events";

export const AREA_OPTIONS = [
  { key: "tokyo", label: "東京" }, { key: "kanagawa", label: "神奈川" }, { key: "chiba", label: "千葉" },
  { key: "saitama", label: "埼玉" }, { key: "osaka", label: "大阪" }, { key: "kyoto", label: "京都" },
  { key: "hyogo", label: "兵庫" }, { key: "other", label: "その他" },
] as const;

export const CUISINE_OPTIONS = [
  { key: "izakaya", label: "居酒屋" }, { key: "japanese", label: "和食" }, { key: "sushi", label: "寿司" },
  { key: "yakitori", label: "焼鳥" }, { key: "yakiniku", label: "焼肉" }, { key: "italian", label: "イタリアン" },
  { key: "french", label: "フレンチ" }, { key: "chinese", label: "中華料理" }, { key: "korean", label: "韓国料理" },
  { key: "cafe", label: "カフェ・喫茶" }, { key: "sweets", label: "スイーツ" }, { key: "wine", label: "ワイン・バー" },
] as const;

export function createDefaultPreferences(): MemberPreferences {
  return {
    // 初回表示ではプロフィールから推測して選択済みにしない。
    preferredAreas: [], favoriteCuisineKeys: [], budgetMinYen: null, budgetMaxYen: null,
    availableDayTypes: [], availableTimeSlots: [], preferredGroupSizes: [],
    preferredEventTypes: [], participationGoals: [], soloParticipationComfort: null,
    newMemberWelcome: false, completedAt: null, updatedAt: new Date().toISOString(),
  };
}

export const DEFAULT_AI_CONSENTS: MemberAiConsents = {
  eventRecommendation: false, memberMatching: false, conciergeHistory: false, anonymousImprovement: false, updatedAt: "",
};

export const DEFAULT_SAFETY_PREFERENCES: MemberSafetyPreferences = {
  allergyText: "", dislikedFoods: "", dietaryRestrictions: "", severity: "none", shareWithOrganizer: false, confirmedAt: null,
};

export function validatePreferences(value: MemberPreferences): string | null {
  if (value.preferredAreas.length > 5) return "希望エリアは5個までです";
  if (value.favoriteCuisineKeys.length > 5) return "好きな料理は5個までです";
  if (value.participationGoals.length > 3) return "参加目的は3個までです";
  const min = value.budgetMinYen ?? 0;
  const max = value.budgetMaxYen ?? 200000;
  if (min < 0 || max > 200000 || min > max) return "予算は0〜200,000円で、下限を上限以下にしてください";
  return null;
}

async function read<T>(storageKey: string, fallback: T): Promise<T> {
  try { const raw = await AsyncStorage.getItem(storageKey); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
}

export function loadMemberPreferences(userId: string) {
  const defaults = createDefaultPreferences();
  return read(key("preferences", userId), defaults);
}

export async function saveMemberPreferences(userId: string, value: MemberPreferences) {
  const error = validatePreferences(value); if (error) throw new Error(error);
  const next = { ...value, completedAt: value.completedAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(key("preferences", userId), JSON.stringify(next)); return next;
}

export function loadMemberAiConsents(userId: string) { return read(key("consents", userId), DEFAULT_AI_CONSENTS); }
export async function saveMemberAiConsents(userId: string, value: MemberAiConsents) {
  const next = { ...value, updatedAt: new Date().toISOString() }; await AsyncStorage.setItem(key("consents", userId), JSON.stringify(next)); return next;
}
export function loadMemberSafetyPreferences(userId: string) { return read(key("safety", userId), DEFAULT_SAFETY_PREFERENCES); }
export async function saveMemberSafetyPreferences(userId: string, value: MemberSafetyPreferences) {
  const next = { ...value, confirmedAt: new Date().toISOString() }; await AsyncStorage.setItem(key("safety", userId), JSON.stringify(next)); return next;
}

export async function recordActivityEvent(input: Omit<MemberActivityEvent, "id" | "occurredAt"> & { dedupeKey?: string }) {
  const current = await read<MemberActivityEvent[]>(ACTIVITY_KEY, []);
  const id = input.dedupeKey ?? `${input.userId}:${input.eventName}:${input.entityId ?? "none"}:${Date.now()}`;
  if (current.some((item) => item.id === id)) return;
  const { dedupeKey: _dedupeKey, ...safeInput } = input;
  const next: MemberActivityEvent = { ...safeInput, id, occurredAt: new Date().toISOString() };
  await AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify([next, ...current].slice(0, 500)));
}

export async function loadActivityEvents(userId: string) {
  return (await read<MemberActivityEvent[]>(ACTIVITY_KEY, [])).filter((item) => item.userId === userId);
}

export async function saveEventFeedback(value: EventFeedback) {
  const storageKey = key("feedback", value.userId); const current = await read<EventFeedback[]>(storageKey, []);
  await AsyncStorage.setItem(storageKey, JSON.stringify([value, ...current.filter((item) => item.eventId !== value.eventId)]));
  await recordActivityEvent({ userId: value.userId, eventName: "event_feedback_submitted", entityType: "event", entityId: value.eventId });
}

export async function loadEventFeedback(userId: string, eventId: string) {
  return (await read<EventFeedback[]>(key("feedback", userId), [])).find((item) => item.eventId === eventId) ?? null;
}
