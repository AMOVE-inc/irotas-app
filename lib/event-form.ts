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

/** 幹事・同席者・募集枠を収容するために必要な最小予約人数。 */
export function minimumReservationCapacity(recruitCapacity: string, companionIds: readonly string[]) {
  return 1 + companionIds.length + Number(recruitCapacity || 0);
}

function amountOption(value: number) {
  return value > 0 ? `${value.toLocaleString()}円` : "";
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
    restaurantName: event.restaurantName ?? "",
    eventName: event.title ?? "",
    date: event.date ?? "",
    time: event.time ?? "",
    address: event.location === "住所未設定" ? "" : event.location ?? "",
    reservationCapacity: String(event.reservationCapacity ?? event.capacity ?? ""),
    recruitCapacity: String(event.capacity ?? ""),
    fixedAmount,
    budgetMin: fixedAmount ? String(priceMin || "") : amountOption(priceMin),
    budgetMax: fixedAmount ? "" : amountOption(priceMax),
    tabelogUrl: event.tabelogUrl ?? "",
    googleMapsUrl: event.googleMapsUrl ?? "",
    companionIds: event.companionIds ?? [],
    image: typeof event.image === "string" ? event.image : "",
    decisionDate: event.applicationDeadline ?? "",
    publicNotes: event.publicNotes ?? event.description ?? "",
    privateMemo: event.privateMemo ?? "",
    cancellationPolicy: event.cancellationPolicy ?? DEFAULT_CANCELLATION_POLICY,
    selectionMethod: event.selectionMethod === "lottery" ? "lottery" : "first_come",
    useRankPrices: Boolean(event.rankPrices && EVENT_RANKS.some((rank) => event.rankPrices?.[rank])),
    rankPrices,
    genres: event.genres ?? [],
  };
}

export function validateEventForm(values: EventFormValues, options: { requireImage: boolean; requireTerms?: boolean; termsAccepted?: boolean; allowedClubIds?: string[]; allowEmptyGenres?: boolean }) {
  const clubEvent = values.eventType === "club";
  if ((!clubEvent && !values.restaurantName.trim()) || (clubEvent && (!values.eventName.trim() || !values.clubId)) || !values.date || !values.time || !values.reservationCapacity || !values.recruitCapacity || !values.budgetMin || (!values.fixedAmount && !values.budgetMax) || !values.decisionDate || !values.cancellationPolicy.trim() || (!clubEvent && !options.allowEmptyGenres && values.genres.length === 0) || (options.requireImage && !values.image) || (options.requireTerms && !options.termsAccepted)) return "必須項目と規約同意を確認してください";
  if (clubEvent && options.allowedClubIds && !options.allowedClubIds.includes(values.clubId)) return "所属している部活動のみイベントを作成・編集できます。";
  const extracted = extractEventLocation(values.address);
  if (values.address.trim() && !extracted.prefecture) return "住所を入力する場合は都道府県名を含めてください";
  if (values.decisionDate > values.date) return "参加者決定予定日は開催日以前を選択してください";
  if (!values.fixedAmount && numericEventAmount(values.budgetMin) > numericEventAmount(values.budgetMax)) return "下限金額は上限金額以下にしてください";
  if (minimumReservationCapacity(values.recruitCapacity, values.companionIds) > Number(values.reservationCapacity)) return "予約人数には、自分・同席者・募集人数の全員が収まるよう設定してください";
  if ([values.tabelogUrl, values.googleMapsUrl].some((url) => url && !/^https?:\/\//i.test(url))) return "URLは http:// または https:// から入力してください";
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
