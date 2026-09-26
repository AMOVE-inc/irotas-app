import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";
import { reserveGoogleMapsRequest } from "./google-maps-cost-control";

const PATH = "/api/concierge/search";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const AREAS = ["中目黒", "目黒", "渋谷", "新宿", "恵比寿", "代官山", "銀座", "六本木", "麻布", "池袋", "品川", "五反田", "上野", "浅草", "横浜", "梅田", "難波", "京都", "神戸"];
const GENRES = ["居酒屋", "焼肉", "焼き肉", "寿司", "鮨", "イタリアン", "フレンチ", "和食", "中華", "ラーメン", "カフェ"];

async function feedPlaces(query: string, feedUrl?: string) {
  if (!feedUrl) return [];
  try {
    const response = await fetch(feedUrl, { headers: { accept: "application/json" }, redirect: "follow" });
    if (!response.ok) return [];
    const feed = await response.json() as { restaurants?: Record<string, unknown>[] };
    const area = AREAS.find((value) => query.includes(value));
    const genre = GENRES.find((value) => query.includes(value));
    return (feed.restaurants ?? []).filter((restaurant) => {
      const address = String(restaurant.address ?? "");
      const restaurantGenre = String(restaurant.genre ?? "");
      return (!area || address.includes(area)) && (!genre || restaurantGenre.includes(genre.replace("焼き肉", "焼肉")) || String(restaurant.name ?? "").includes(genre));
    }).sort((a, b) => Number(b.rating ?? b.memberRating ?? 0) - Number(a.rating ?? a.memberRating ?? 0)).slice(0, 5).map((restaurant) => ({ id: String(restaurant.id ?? ""), name: String(restaurant.name ?? ""), address: String(restaurant.address ?? ""), rating: Number(restaurant.rating ?? restaurant.memberRating ?? 0) || undefined, reviewCount: Number(restaurant.reviewCount ?? 0) || undefined, url: typeof restaurant.googleMapsUrl === "string" ? restaurant.googleMapsUrl : undefined, genre: String(restaurant.genre ?? "飲食店") }));
  } catch { return []; }
}

export async function handleConciergeRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== PATH) return null;
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);
  const input = await request.json() as Record<string, unknown>;
  const query = typeof input.query === "string" ? input.query.normalize("NFKC").trim().slice(0, 160) : "";
  if (!query) return json({ error: "検索条件を入力してください" }, 400);
  let places: { id?: string; name?: string; address?: string; rating?: number; reviewCount?: number; url?: string; genre?: string }[] = await feedPlaces(query, env.GOURMET_MAP_FEED_URL);
  // IRO+の保有データを最優先し、該当がない時だけ有料のPlaces検索を使う。
  if (!places.length && env.GOOGLE_MAPS_API_KEY && await reserveGoogleMapsRequest(env, "search")) {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GOOGLE_MAPS_API_KEY, "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryTypeDisplayName" },
    body: JSON.stringify({ textQuery: query, languageCode: "ja", regionCode: "JP", maxResultCount: 5 }),
  });
    if (response.ok) {
      const result = await response.json() as { places?: { id?: string; displayName?: { text?: string }; formattedAddress?: string; rating?: number; userRatingCount?: number; googleMapsUri?: string; primaryTypeDisplayName?: { text?: string } }[] };
      places = (result.places ?? []).slice(0, 5).map((place) => ({ id: place.id, name: place.displayName?.text, address: place.formattedAddress, rating: place.rating, reviewCount: place.userRatingCount, url: place.googleMapsUri, genre: place.primaryTypeDisplayName?.text })).filter((place) => place.name && place.address);
    }
  }
  if (!places.length) return json({ reply: "指定されたエリアとジャンルに一致する店舗が見つかりませんでした。駅名や料理ジャンルを変えてお試しください。", places: [] });
  const lines = places.slice(0, 3).map((place) => `・${place.name}（${place.genre ?? "飲食店"}）\n${place.address}${place.rating ? `／評価 ${place.rating}${place.reviewCount ? `（${place.reviewCount}件）` : ""}` : ""}${place.url ? `\n${place.url}` : ""}`);
  return json({ reply: `「${query}」の条件で、現在の店舗情報から候補を絞りました。\n\n${lines.join("\n\n")}\n\n営業時間や空席はリンク先で最新情報をご確認ください。`, places });
}
