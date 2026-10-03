import type { Event } from "../constants/mock-data";
import { AREA_OPTIONS, CUISINE_OPTIONS, type GroupSize, type MemberPreferences, type TimeSlot } from "./ai-data-store";
import { hasEventVacancy } from "./event-participation";

export interface RecommendedEvent { event: Event; score: number; reasons: string[]; }

function areaKey(event: Event) {
  const text = `${event.prefecture ?? ""}${event.location}`;
  return AREA_OPTIONS.find((item) => text.includes(item.label))?.key ?? "other";
}
function cuisineKeys(event: Event) {
  const text = `${event.genres?.join(" ") ?? ""} ${event.title} ${event.restaurantName ?? ""}`;
  const aliases: Record<string, string[]> = {
    sushi: ["鮨", "すし", "スシ"],
    yakitori: ["焼き鳥", "やきとり"],
    yakiniku: ["焼き肉"],
  };
  return CUISINE_OPTIONS.filter((item) =>
    text.includes(item.label) || (aliases[item.key] ?? []).some((alias) => text.includes(alias)) || (item.key === "wine" && text.includes("ワイン"))
  ).map((item) => item.key);
}
function timeSlot(time: string): TimeSlot {
  const hour = Number(time.slice(0, 2)); if (hour < 14) return "lunch"; if (hour < 17) return "afternoon"; if (hour < 22) return "dinner"; return "late_night";
}
function groupSize(capacity: number): GroupSize { return capacity <= 6 ? "small" : capacity <= 12 ? "medium" : "large"; }
function dateAt(event: Event) { return new Date(`${event.date}T${event.time || "00:00"}:00`); }
function overlapsBudget(event: Event, preferences: MemberPreferences) {
  const min = event.priceMin ?? Number((event.price.match(/[\d,]+/)?.[0] ?? "0").replaceAll(",", "")); const max = event.priceMax ?? min;
  return (preferences.budgetMaxYen === null || min <= preferences.budgetMaxYen) && (preferences.budgetMinYen === null || max >= preferences.budgetMinYen);
}

export function recommendEvents(events: Event[], preferences: MemberPreferences, userId: string, now = new Date()): RecommendedEvent[] {
  return events.filter((event) => {
    const date = dateAt(event); const applied = event.applicantIds?.includes(userId) || event.participants.includes(userId);
    return hasEventVacancy(event) && date >= now && !applied;
  }).map((event) => {
    let score = 0; const reasons: string[] = [];
    if (cuisineKeys(event).some((key) => preferences.favoriteCuisineKeys.includes(key))) { score += 25; reasons.push("好きな料理ジャンル"); }
    if (preferences.preferredAreas.includes(areaKey(event))) { score += 20; reasons.push("希望エリア"); }
    if (overlapsBudget(event, preferences)) { score += 20; reasons.push("希望予算"); }
    const day = dateAt(event).getDay(); const dayKey = day === 6 ? "saturday" : day === 0 ? "sunday_holiday" : "weekday";
    if (preferences.availableDayTypes.includes(dayKey) && preferences.availableTimeSlots.includes(timeSlot(event.time))) { score += 15; reasons.push("参加しやすい日時"); }
    if (preferences.preferredGroupSizes.includes("any") || (!event.capacityMode && preferences.preferredGroupSizes.includes(groupSize(event.capacity)))) { score += 10; reasons.push("希望の人数規模"); }
    if ((event.eventType === "club" && preferences.preferredEventTypes.includes("club_activity")) || (event.eventType !== "club" && preferences.preferredEventTypes.includes("regular_dining"))) { score += 10; reasons.push("興味のあるイベント種別"); }
    return { event, score, reasons };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.event.date.localeCompare(b.event.date)).slice(0, 6);
}
