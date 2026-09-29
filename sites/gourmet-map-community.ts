import { authenticatedRequestMember } from "./auth";
import { reserveGoogleMapsRequest } from "./google-maps-cost-control";
import type { D1Database, SitesEnv } from "./platform-types";

const CANDIDATES_PATH = "/api/gourmet-map/candidates";
const CANDIDATE_PATH = /^\/api\/gourmet-map\/candidates\/([^/]+)$/;

type CandidateRow = {
  id: string;
  source_thread_id: string;
  report_title: string;
  restaurant_name: string;
  area: string;
  member_rating: number;
  member_comment: string;
  google_maps_url: string;
  image_url: string | null;
  place_id: string | null;
  status: "pending" | "published" | "rejected" | "ineligible";
  created_at: string;
  updated_at: string;
};

type PlaceResult = {
  id?: string;
  displayName?: { text?: string };
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  photos?: { name?: string }[];
};

const CATEGORY_RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["イタリアン", ["italian_restaurant", "イタリア", "イタリアン", "ピザ", "pizza"]],
  ["フレンチ", ["french_restaurant", "フランス料理", "フレンチ"]],
  ["スペイン料理", ["spanish_restaurant", "スペイン料理", "スペイン", "tapas"]],
  ["韓国料理", ["korean_restaurant", "韓国料理", "韓国"]],
  ["中華料理", ["chinese_restaurant", "中華料理", "中国料理"]],
  ["焼肉", ["yakiniku_restaurant", "焼肉", "ホルモン"]],
  ["焼鳥", ["yakitori_restaurant", "焼鳥", "焼き鳥"]],
  ["寿司", ["sushi_restaurant", "寿司", "鮨", "すし"]],
  ["バー", ["bar", "wine_bar", "cocktail_bar", "バー", "bar"]],
  ["カフェ・喫茶", ["cafe", "coffee_shop", "tea_house", "カフェ", "喫茶"]],
  ["うなぎ", ["うなぎ", "鰻"]],
  ["天ぷら", ["天ぷら", "天麩羅"]],
  ["とんかつ", ["とんかつ", "トンカツ", "豚カツ"]],
  ["そば・うどん", ["udon_restaurant", "そば", "蕎麦", "うどん"]],
  ["ステーキ・鉄板焼き", ["steak_house", "ステーキ", "鉄板焼"]],
  ["ハンバーガー", ["hamburger_restaurant", "ハンバーガー", "burger"]],
  ["ラーメン", ["ramen_restaurant", "ラーメン", "らーめん"]],
  ["カレー", ["カレー", "curry"]],
  ["シーフード・海鮮", ["seafood_restaurant", "海鮮", "魚介", "シーフード"]],
  ["中南米料理（メキシコ、ブラジル、ペルーなど）", ["mexican_restaurant", "brazilian_restaurant", "latin_american_restaurant", "メキシコ", "ブラジル", "ペルー"]],
  ["アジア・エスニック", ["thai_restaurant", "vietnamese_restaurant", "indian_restaurant", "indonesian_restaurant", "asian_restaurant", "タイ料理", "ベトナム", "インド料理", "エスニック"]],
  ["居酒屋", ["izakaya_restaurant", "居酒屋"]],
  ["和食", ["japanese_restaurant", "和食", "日本料理", "懐石", "割烹"]],
  ["欧州料理（イギリス、ドイツ、スイスなど）", ["german_restaurant", "british_restaurant", "european_restaurant", "ドイツ料理", "英国料理", "欧州料理"]],
  ["洋食", ["western_restaurant", "洋食"]],
];

/** Google Places の型・表示名・店名を、IRO+の保存リスト名へ正規化する。 */
export function inferGourmetMapCategory(place: PlaceResult | null | undefined, restaurantName = "") {
  const placeTypes = [place?.primaryType, ...(place?.types ?? [])].filter((value): value is string => Boolean(value))
    .map((value) => value.toLocaleLowerCase("ja"));
  const humanText = [place?.primaryTypeDisplayName?.text, restaurantName].filter(Boolean).join(" ").toLocaleLowerCase("ja");
  return CATEGORY_RULES.find(([, tokens]) => tokens.some((token) => {
    const normalized = token.toLocaleLowerCase("ja");
    return /^[a-z_]+$/.test(normalized) ? placeTypes.includes(normalized) : humanText.includes(normalized);
  }))?.[0]
    ?? "創作料理・イノベーティブ";
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
}

function validGoogleMapsUrl(value: string) {
  return /^https:\/\/(maps\.app\.goo\.gl|(?:www\.)?google\.[^/]+\/maps|maps\.google\.)/i.test(value);
}

export function mealReportCandidateFromData(dataJson: string) {
  try {
    const data = JSON.parse(dataJson) as { images?: unknown; mealReport?: unknown };
    if (!data.mealReport || typeof data.mealReport !== "object" || Array.isArray(data.mealReport)) return null;
    const report = data.mealReport as Record<string, unknown>;
    const rating = Number(report.rating);
    const googleMapsUrl = typeof report.googleMapUrl === "string" ? report.googleMapUrl.trim() : "";
    const restaurantName = typeof report.restaurantName === "string" ? report.restaurantName.trim() : "";
    const area = typeof report.areaDisplay === "string" && report.areaDisplay.trim()
      ? report.areaDisplay.trim() : typeof report.prefecture === "string" ? report.prefecture.trim() : "";
    const comment = typeof report.comment === "string" ? report.comment.trim() : "";
    const image = Array.isArray(data.images) ? data.images.find((value): value is string => typeof value === "string" && value.length <= 500) : undefined;
    return { rating, googleMapsUrl, restaurantName, area, comment, image };
  } catch { return null; }
}

async function feedAction(env: SitesEnv, action: string, payload: unknown) {
  if (!env.GOURMET_MAP_FEED_URL) throw new Error("GOURMET_MAP_FEED_URL is not configured");
  const response = await fetch(env.GOURMET_MAP_FEED_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`gourmet map feed returned ${response.status}`);
  const result = await response.json() as { success?: boolean };
  if (result.success !== true) throw new Error("gourmet map feed rejected update");
  return result;
}

async function resolvePlace(candidate: CandidateRow, env: SitesEnv): Promise<PlaceResult | null> {
  if (!env.GOOGLE_MAPS_API_KEY || !(await reserveGoogleMapsRequest(env, "search"))) return null;
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GOOGLE_MAPS_API_KEY,
        "x-goog-fieldmask": "places.id,places.displayName,places.primaryType,places.primaryTypeDisplayName,places.types,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.photos",
      },
      body: JSON.stringify({ textQuery: `${candidate.restaurant_name} ${candidate.area}`, languageCode: "ja" }),
    });
    if (!response.ok) return null;
    const result = await response.json() as { places?: PlaceResult[] };
    return result.places?.[0] ?? null;
  } catch { return null; }
}

async function publishCandidate(db: D1Database, env: SitesEnv, candidate: CandidateRow, reviewerId: number) {
  const place = await resolvePlace(candidate, env);
  if (!place?.id) throw new Error("Google Place IDを確認できませんでした");
  const genre = inferGourmetMapCategory(place, candidate.restaurant_name);
  const matching = await db.prepare(`SELECT member_comment FROM gourmet_map_candidates
    WHERE place_id = ? AND status = 'published' AND id != ? ORDER BY created_at ASC`)
    .bind(place.id, candidate.id).all<{ member_comment: string }>();
  const comments = [...new Set([...(matching.results ?? []).map((row) => row.member_comment), candidate.member_comment].filter(Boolean))];
  await feedAction(env, "upsertMealReport", {
    reportId: candidate.source_thread_id,
    reportTitle: candidate.report_title,
    restaurantName: candidate.restaurant_name,
    area: candidate.area,
    memberRating: candidate.member_rating,
    memberComment: comments.join("\n\n"),
    genre,
    googleMapsUrl: candidate.google_maps_url,
    image: candidate.image_url ?? undefined,
    place,
  });
  const now = new Date().toISOString();
  await db.prepare(`UPDATE gourmet_map_candidates SET place_id = ?, status = 'published',
    reviewed_by_member_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
    .bind(place.id, reviewerId, now, now, candidate.id).run();
  return place.id;
}

/**
 * Rebuild the published entry for a place after one of its source reports stops
 * contributing to it. This removes stale member comments while preserving the
 * place when another eligible report still exists.
 */
async function refreshPublishedPlace(
  db: D1Database,
  env: SitesEnv,
  placeId: string,
  reviewerId: number,
) {
  const replacement = await db.prepare(`SELECT * FROM gourmet_map_candidates
    WHERE place_id = ? AND status = 'published' ORDER BY created_at ASC LIMIT 1`)
    .bind(placeId).first<CandidateRow>();
  if (replacement) {
    await publishCandidate(db, env, replacement, reviewerId);
    return;
  }
  await feedAction(env, "setPublished", { id: `community_${placeId}`, published: false });
}

export async function reconcileMealReportCandidate(db: D1Database, env: SitesEnv, input: {
  threadId: string; title: string; content: string; dataJson: string; deleted?: boolean; actorMemberId: number;
}) {
  const report = input.deleted ? null : mealReportCandidateFromData(input.dataJson);
  const eligible = Boolean(report && report.rating >= 4 && report.rating <= 5 && report.restaurantName && report.area && validGoogleMapsUrl(report.googleMapsUrl));
  const existing = await db.prepare("SELECT * FROM gourmet_map_candidates WHERE source_thread_id = ? LIMIT 1")
    .bind(input.threadId).first<CandidateRow>();
  const now = new Date().toISOString();
  if (!eligible || !report) {
    if (existing) {
      await db.prepare("UPDATE gourmet_map_candidates SET status = 'ineligible', updated_at = ? WHERE id = ?")
        .bind(now, existing.id).run();
      if (existing.status === "published" && existing.place_id) {
        await refreshPublishedPlace(db, env, existing.place_id, input.actorMemberId);
      }
    }
    return;
  }
  const id = existing?.id ?? `candidate_${crypto.randomUUID()}`;
  const nextStatus = existing?.status === "published" ? "published" : "pending";
  await db.prepare(`INSERT INTO gourmet_map_candidates
    (id, source_thread_id, report_title, restaurant_name, area, member_rating, member_comment, google_maps_url, image_url, place_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_thread_id) DO UPDATE SET report_title = excluded.report_title,
      restaurant_name = excluded.restaurant_name, area = excluded.area, member_rating = excluded.member_rating,
      member_comment = excluded.member_comment, google_maps_url = excluded.google_maps_url,
      image_url = excluded.image_url, status = CASE WHEN gourmet_map_candidates.status = 'published' THEN 'published' ELSE 'pending' END,
      updated_at = excluded.updated_at`)
    .bind(id, input.threadId, input.title, report.restaurantName, report.area, report.rating,
      report.comment || input.content, report.googleMapsUrl, report.image ?? null, existing?.place_id ?? null, nextStatus, existing?.created_at ?? now, now).run();
  const current = await db.prepare("SELECT * FROM gourmet_map_candidates WHERE source_thread_id = ? LIMIT 1")
    .bind(input.threadId).first<CandidateRow>();
  if (!current) return;
  if (current.status === "published" || env.GOURMET_MAP_AUTO_PUBLISH_MIN_REPORTERS === "1") {
    const previousPlaceId = existing?.status === "published" ? existing.place_id : null;
    const nextPlaceId = await publishCandidate(db, env, current, input.actorMemberId);
    if (previousPlaceId && previousPlaceId !== nextPlaceId) {
      await refreshPublishedPlace(db, env, previousPlaceId, input.actorMemberId);
    }
  }
}

export async function handleGourmetMapCandidateRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const match = CANDIDATE_PATH.exec(url.pathname);
  if (url.pathname !== CANDIDATES_PATH && !match) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);
  if (!(["operator", "admin"].includes(member.access_role))) return json({ error: "運営メンバーのみ操作できます" }, 403);
  if (url.pathname === CANDIDATES_PATH && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM gourmet_map_candidates WHERE status = 'pending' ORDER BY created_at ASC").all<CandidateRow>();
    return json({ candidates: rows.results ?? [] });
  }
  if (match && request.method === "PATCH") {
    const candidate = await env.DB.prepare("SELECT * FROM gourmet_map_candidates WHERE id = ? LIMIT 1")
      .bind(decodeURIComponent(match[1])).first<CandidateRow>();
    if (!candidate) return json({ error: "候補が見つかりません" }, 404);
    const body = await request.json().catch(() => null) as { action?: unknown } | null;
    if (body?.action === "approve") {
      try { await publishCandidate(env.DB, env, candidate, member.id); }
      catch (error) { return json({ error: error instanceof Error ? error.message : "公開できませんでした" }, 502); }
    } else if (body?.action === "reject") {
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE gourmet_map_candidates SET status = 'rejected', reviewed_by_member_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?")
        .bind(member.id, now, now, candidate.id).run();
    } else return json({ error: "操作が不正です" }, 400);
    return json({ success: true });
  }
  return json({ error: "Method Not Allowed" }, 405);
}
