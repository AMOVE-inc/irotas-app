import type { Event, MemberRank } from "../constants/mock-data";
import { eventCategoryFromPrefecture, extractEventLocation } from "./event-location";

export const EVENT_TIME_OPTIONS = Array.from(
  { length: 96 },
  (_, index) => `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`,
);
export const EVENT_CAPACITY_OPTIONS = Array.from({ length: 100 }, (_, index) => String(index + 1));
export const EVENT_AMOUNT_OPTIONS = Array.from({ length: 300 }, (_, index) => `${((index + 1) * 1000).toLocaleString()}円`);
export const EVENT_RANKS: MemberRank[] = ["regular", "silver", "gold", "platinum"];
export const DEFAULT_CANCELLATION_POLICY = "1週間前より100%のキャンセル料が発生します。代理が見つかった場合はキャンセル料はかかりません";

export type EventFormValues = {
  eventType: Event["eventType"];
  clubId: string;
  restaurantName: string;
  eventName: string;
  date: string;
  time: string;
  address: string;
  reservationCapacity: string;
  recruitCapacity: string;
  fixedAmount: boolean;
  budgetMin: string;
  budgetMax: string;
  tabelogUrl: string;
  googleMapsUrl: string;
  companionIds: string[];
  image: string;
  decisionDate: string;
  publicNotes: string;
  privateMemo: string;
  cancellationPolicy: string;
  selectionMethod: "first_come" | "lottery";
  useRankPrices: boolean;
  rankPrices: Record<MemberRank, string>;
  genres: string[];
};

export function numericEventAmount(value: string) {
  return Number(value.replace(/[^0-9]/g, ""));
}

function japanDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

/** 幹事・同席者・募集枠を収容するために必要な最小予約人数。 */
export function minimumReservationCapacity(recruitCapacity: string, companionIds: readonly string[]) {
  return 1 + companionIds.length + Number(recruitCapacity || 0);
}

/** True when the editor has changed only the companion selection. */
export function hasOnlyCompanionChanges(before: EventFormValues, after: EventFormValues) {
  const withoutCompanions = (values: EventFormValues) => ({ ...values, companionIds: [] as string[] });
  return JSON.stringify(withoutCompanions(before)) === JSON.stringify(withoutCompanions(after))
    && JSON.stringify(before.companionIds) !== JSON.stringify(after.companionIds);
}

function amountOption(value: number) {
  return value > 0 ? `${value.toLocaleString()}円` : "";
}

function editableEventAddress(event: Event) {
  const location = event.location === "住所未設定" ? "" : event.location ?? "";
  if (!location || extractEventLocation(location).prefecture) return location;
  const addressFromDescription = (event.description ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => Boolean(extractEventLocation(line).prefecture));
  return addressFromDescription ?? location;
}

export function eventFormValuesFromEvent(event: Event): EventFormValues {
  const priceMin = event.priceMin ?? numericEventAmount(event.price);
  const priceMax = event.priceMax ?? priceMin;
  const fixedAmount = priceMin === priceMax;
  const rankPrices = EVENT_RANKS.reduce<Record<MemberRank, string>>((result, rank) => {
    result[rank] = event.rankPrices?.[rank] ?? "";
    return result;
  }, { regular: "", silver: "", gold: "", platinum: "" });
  return {
    eventType: event.eventType,
    clubId: event.clubId ?? "",
    restaurantName: event.restaurantName ?? (event.location !== "住所未設定" && event.location !== "詳細をご確認ください" ? event.location : ""),
    eventName: event.title ?? "",
    date: event.date ?? "",
    time: event.time ?? "",
    address: editableEventAddress(event),
    reservationCapacity: String(event.reservationCapacity ?? event.capacity ?? ""),
    recruitCapacity: String(event.capacity ?? ""),
    fixedAmount,
    budgetMin: fixedAmount ? String(priceMin || "") : amountOption(priceMin),
    budgetMax: fixedAmount ? "" : amountOption(priceMax),
    tabelogUrl: event.tabelogUrl ?? "",
    googleMapsUrl: event.googleMapsUrl ?? "",
    companionIds: event.companionIds ?? [],
    image: typeof event.image === "string" ? event.image : "",
    // Discordから移行した旧イベントには決定予定日が無いものがある。
    // 編集時だけ開催日を安全な初期値にし、必須入力で保存不能になるのを防ぐ。
    decisionDate: event.applicationDeadline ?? event.date ?? "",
    publicNotes: event.publicNotes ?? event.description ?? "",
    privateMemo: event.privateMemo ?? "",
    cancellationPolicy: event.cancellationPolicy ?? DEFAULT_CANCELLATION_POLICY,
    selectionMethod: event.selectionMethod === "lottery" ? "lottery" : "first_come",
    useRankPrices: Boolean(event.rankPrices && EVENT_RANKS.some((rank) => event.rankPrices?.[rank])),
    rankPrices,
    genres: event.genres ?? [],
  };
}

export function validateEventForm(values: EventFormValues, options: { requireImage: boolean; requireTerms?: boolean; termsAccepted?: boolean; allowedClubIds?: string[]; allowEmptyGenres?: boolean; allowPastDate?: boolean }) {
  const clubEvent = values.eventType === "club";
  const missing: string[] = [];
  if (!clubEvent && !values.restaurantName.trim()) missing.push("店名");
  if (clubEvent && !values.eventName.trim()) missing.push("イベント名");
  if (clubEvent && !values.clubId) missing.push("開催する部活動");
  if (!values.date) missing.push("開催日");
  if (!values.time) missing.push("開始時間");
  if (!values.reservationCapacity) missing.push("予約人数");
  if (!values.recruitCapacity) missing.push("募集人数");
  if (!values.budgetMin) missing.push(values.eventType === "official" ? "参加費" : "予算");
  if (!values.fixedAmount && !values.budgetMax) missing.push("予算の上限");
  if (!values.decisionDate) missing.push("参加者決定予定日");
  if (!values.cancellationPolicy.trim()) missing.push("キャンセルポリシー");
  if (!clubEvent && !options.allowEmptyGenres && values.genres.length === 0) missing.push("グルメジャンル");
  if (options.requireImage && !values.image) missing.push("写真");
  if (options.requireTerms && !options.termsAccepted) missing.push("イベント開催時のルールへの同意");
  if (missing.length) return `次の項目を設定してください：${missing.join("、")}`;
  if (!options.allowPastDate && values.date < japanDateKey()) return "開催日は本日以降に設定してください";
  if (clubEvent && options.allowedClubIds && !options.allowedClubIds.includes(values.clubId)) return "所属している部活動のみイベントを作成・編集できます。";
  const extracted = extractEventLocation(values.address);
  if (values.address.trim() && !extracted.prefecture) return "住所を入力する場合は都道府県名を含めてください";
  if (values.decisionDate > values.date) return "参加者決定予定日は開催日以前を選択してください";
  if (!values.fixedAmount && numericEventAmount(values.budgetMin) > numericEventAmount(values.budgetMax)) return "下限金額は上限金額以下にしてください";
  if (minimumReservationCapacity(values.recruitCapacity, values.companionIds) > Number(values.reservationCapacity)) return "予約人数には、自分・同席者・募集人数の全員が収まるよう設定してください";
  if (values.tabelogUrl && !/^https?:\/\//i.test(values.tabelogUrl)) return "食べログURLは http:// または https:// から入力してください";
  if (values.googleMapsUrl && !/^https?:\/\//i.test(values.googleMapsUrl)) return "GoogleマップURLは http:// または https:// から入力してください";
  if (values.eventType === "official" && values.useRankPrices && EVENT_RANKS.some((rank) => !values.rankPrices[rank])) return "ランク別料金を設定する場合は、すべてのランクの料金を選択してください";
  return null;
}

export function eventFormSaveFields(values: EventFormValues): Pick<Event, "title" | "restaurantName" | "description" | "date" | "time" | "location" | "prefecture" | "tokyoArea" | "capacity" | "reservationCapacity" | "price" | "priceMin" | "priceMax" | "genres" | "rankPrices" | "category" | "eventType" | "clubId" | "applicationDeadline" | "cancellationPolicy" | "selectionMethod" | "tabelogUrl" | "googleMapsUrl" | "publicNotes" | "privateMemo" | "companionIds"> {
  const extracted = extractEventLocation(values.address);
  const priceMin = numericEventAmount(values.budgetMin);
  const priceMax = values.fixedAmount ? priceMin : numericEventAmount(values.budgetMax);
  const rankPrices = values.eventType === "official" && values.useRankPrices
    ? Object.fromEntries(EVENT_RANKS.map((rank) => [rank, values.rankPrices[rank]]))
    : undefined;
  return {
    title: values.eventName.trim() || values.restaurantName.trim(),
    restaurantName: values.restaurantName.trim(),
    description: values.publicNotes.trim(),
    date: values.date,
    time: values.time,
    location: values.address.trim() || "住所未設定",
    prefecture: extracted.prefecture,
    tokyoArea: extracted.tokyoArea,
    capacity: Number(values.recruitCapacity),
    reservationCapacity: Number(values.reservationCapacity),
    price: values.fixedAmount ? `${priceMin.toLocaleString()}円` : `${values.budgetMin}〜${values.budgetMax}`,
    priceMin,
    priceMax,
    genres: values.genres,
    rankPrices: rankPrices ?? {},
    category: eventCategoryFromPrefecture(extracted.prefecture),
    eventType: values.eventType,
    clubId: values.eventType === "club" ? values.clubId : undefined,
    companionIds: values.companionIds,
    applicationDeadline: values.decisionDate,
    cancellationPolicy: values.cancellationPolicy.trim(),
    selectionMethod: values.eventType === "official" ? values.selectionMethod : "first_come",
    tabelogUrl: values.tabelogUrl.trim(),
    googleMapsUrl: values.googleMapsUrl.trim(),
    publicNotes: values.publicNotes.trim(),
    privateMemo: values.privateMemo.trim(),
  };
}
