import type { SitesEnv } from "./platform-types";

export type GoogleMapsUsageKind = "photo" | "search";

function configuredLimit(env: SitesEnv, kind: GoogleMapsUsageKind) {
  const raw = kind === "photo"
    ? env.GOOGLE_MAPS_PHOTO_MONTHLY_LIMIT ?? "5000"
    : env.GOOGLE_MAPS_SEARCH_MONTHLY_LIMIT ?? "1000";
  const parsed = Number.parseInt(raw, 10);
  const fallback = kind === "photo" ? 5_000 : 1_000;
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 100_000)) : fallback;
}

export async function reserveGoogleMapsRequest(env: SitesEnv, kind: GoogleMapsUsageKind) {
  const limit = configuredLimit(env, kind);
  if (limit === 0) return false;
  // Production has D1. Environments without D1 retain local preview support;
  // the Google Cloud key must never be registered in those environments.
  if (!env.DB) return true;
  const now = new Date().toISOString();
  const monthKey = now.slice(0, 7);
  const reserved = await env.DB.prepare(
    `INSERT INTO google_maps_api_usage (usage_kind, month_key, request_count, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(usage_kind, month_key) DO UPDATE SET
       request_count = google_maps_api_usage.request_count + 1,
       updated_at = excluded.updated_at
     WHERE google_maps_api_usage.request_count < ?
     RETURNING request_count`,
  ).bind(kind, monthKey, now, limit).first<{ request_count: number }>();
  return Boolean(reserved);
}
