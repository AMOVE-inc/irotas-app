import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const ROOT = "/api/campaigns";
const ITEM = /^\/api\/campaigns\/([^/]+)$/;
const RANKS = ["all", "silver", "gold", "platinum"] as const;
const STATUSES = ["active", "scheduled", "ended"] as const;
const TYPES = ["points", "event", "gift", "notification"] as const;

type Viewer = NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
}

function canManage(viewer: Viewer) {
  return viewer.role === "admin" || viewer.access_role === "admin" || viewer.role === "operator" || viewer.access_role === "operator";
}

async function readBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 32 * 1024) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function campaignInput(input: Record<string, unknown>) {
  const title = typeof input.title === "string" ? input.title.normalize("NFKC").trim() : "";
  const description = typeof input.description === "string" ? input.description.normalize("NFKC").trim() : "";
  const startDate = typeof input.startDate === "string" ? input.startDate.trim() : "";
  const endDate = typeof input.endDate === "string" ? input.endDate.trim() : "";
  const reachCount = Number(input.reachCount ?? 0);
  if (!title || title.length > 200 || description.length > 4000 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate || !Number.isInteger(reachCount) || reachCount < 0 || reachCount > 10_000_000) return null;
  if (!RANKS.includes(input.targetRank as typeof RANKS[number]) || !STATUSES.includes(input.status as typeof STATUSES[number]) || !TYPES.includes(input.type as typeof TYPES[number])) return null;
  return { title, description, startDate, endDate, reachCount, targetRank: String(input.targetRank), status: String(input.status), type: String(input.type) };
}

function fromRow(row: Record<string, unknown>) {
  return { id: row.id, title: row.title, description: row.description, targetRank: row.target_rank, startDate: row.start_date, endDate: row.end_date, status: row.status, type: row.type, reachCount: Number(row.reach_count ?? 0) };
}

async function list(db: D1Database) {
  const rows = await db.prepare("SELECT * FROM campaigns WHERE deleted_at IS NULL ORDER BY start_date DESC, created_at DESC").all<Record<string, unknown>>();
  return json({ campaigns: (rows.results ?? []).map(fromRow) });
}

async function save(request: Request, db: D1Database, viewer: Viewer, id: string) {
  const body = await readBody(request);
  const input = body && campaignInput(body);
  if (!input) return json({ error: "入力内容を確認してください" }, 400);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO campaigns (id, title, description, target_rank, start_date, end_date, status, type, reach_count, created_by_member_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, target_rank = excluded.target_rank,
        start_date = excluded.start_date, end_date = excluded.end_date, status = excluded.status, type = excluded.type,
        reach_count = excluded.reach_count, updated_at = excluded.updated_at, deleted_at = NULL`)
      .bind(id, input.title, input.description, input.targetRank, input.startDate, input.endDate, input.status, input.type, input.reachCount, viewer.id, now, now),
    db.prepare("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, 'campaign.saved', 'campaign', ?, '{}', ?)").bind(String(viewer.id), id, now),
  ]);
  return json({ success: true });
}

export async function handleCampaignRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const match = ITEM.exec(pathname);
  if (pathname !== ROOT && !match) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer) return json({ error: "ログインが必要です" }, 401);
  if (pathname === ROOT) return request.method === "GET" ? list(env.DB) : json({ error: "method_not_allowed" }, 405);
  if (!canManage(viewer)) return json({ error: "運営権限が必要です" }, 403);
  const id = decodeURIComponent(match![1]);
  if (!id || id.length > 128) return json({ error: "キャンペーンIDを確認してください" }, 400);
  if (request.method === "DELETE") {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE campaigns SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id),
      env.DB.prepare("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, 'campaign.deleted', 'campaign', ?, '{}', ?)").bind(String(viewer.id), id, now),
    ]);
    return json({ success: true });
  }
  return ["PUT", "PATCH"].includes(request.method) ? save(request, env.DB, viewer, id) : json({ error: "method_not_allowed" }, 405);
}
