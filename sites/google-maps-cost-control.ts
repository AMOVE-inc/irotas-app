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

function usageMonthKey(kind: GoogleMapsUsageKind) {
  const month = new Date().toISOString().slice(0, 7);
  // Photo accounting v1 counted failed upstream requests and exhausted the
  // budget without displaying photos. Keep a revisioned bucket so the fixed
  // success-aware accounting starts cleanly without mutating audit history.
  return kind === "photo" ? `${month}:v2` : month;
}

export async function reserveGoogleMapsRequest(env: SitesEnv, kind: GoogleMapsUsageKind) {
  const limit = configuredLimit(env, kind);
  if (limit === 0) return false;
  // Production has D1. Environments without D1 retain local preview support;
  // the Google Cloud key must never be registered in those environments.
  if (!env.DB) return true;
  const now = new Date().toISOString();
  const monthKey = usageMonthKey(kind);
  const reserve = () => env.DB!.prepare(
      `INSERT INTO google_maps_api_usage (usage_kind, month_key, request_count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(usage_kind, month_key) DO UPDATE SET
         request_count = google_maps_api_usage.request_count + 1,
         updated_at = excluded.updated_at
       WHERE google_maps_api_usage.request_count < ?
       RETURNING request_count`,
    ).bind(kind, monthKey, now, limit).first<{ request_count: number }>();
  let reserved;
  try {
    reserved = await reserve();
  } catch (error) {
    // Sites deployments can make the Worker live before a newly packaged D1
    // migration is visible. Create only this bounded counter table, then retry.
    if (!String(error).includes("google_maps_api_usage")) throw error;
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS google_maps_api_usage (
         usage_kind TEXT NOT NULL CHECK (usage_kind IN ('photo', 'search')),
         month_key TEXT NOT NULL,
         request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
         updated_at TEXT NOT NULL,
         PRIMARY KEY (usage_kind, month_key)
       )`,
    ).run();
    reserved = await reserve();
  }
  return Boolean(reserved);
}

/** Refund a reservation when Google did not return a billable usable result. */
export async function releaseGoogleMapsRequest(env: SitesEnv, kind: GoogleMapsUsageKind) {
  if (!env.DB) return;
  await env.DB.prepare(
    `UPDATE google_maps_api_usage
     SET request_count = CASE WHEN request_count > 0 THEN request_count - 1 ELSE 0 END,
         updated_at = ?
     WHERE usage_kind = ? AND month_key = ?`,
  ).bind(new Date().toISOString(), kind, usageMonthKey(kind)).run();
}
