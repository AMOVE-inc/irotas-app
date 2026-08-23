import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const XP_AWARD_ENDPOINT = "/api/xp/award";
const REWARDS = {
  event_create: { amount: 5, reason: "イベントの新規作成" },
  board_post: { amount: 5, reason: "掲示板投稿" },
  meal_report_post: { amount: 8, reason: "ごちそうさま報告投稿" },
} as const;

type XpAction = keyof typeof REWARDS;
type Viewer = NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
}

export function rankFromXp(xp: number) {
  if (xp >= 1000) return "platinum";
  if (xp >= 500) return "gold";
  if (xp >= 100) return "silver";
  return "regular";
}

async function validSource(db: D1Database, viewer: Viewer, action: XpAction, sourceId: string) {
  if (action === "event_create") {
    return Boolean(await db.prepare("SELECT id FROM events WHERE id = ? AND organizer_member_id = ? LIMIT 1")
      .bind(sourceId, viewer.id).first());
  }
  const row = await db.prepare("SELECT category FROM board_threads WHERE id = ? AND author_member_id = ? AND deleted_at IS NULL LIMIT 1")
    .bind(sourceId, viewer.id).first<{ category: string }>();
  if (!row) return false;
  return action === "meal_report_post" ? row.category === "meal-report" : row.category !== "meal-report";
}

async function readBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8 * 1024) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

async function award(request: Request, db: D1Database, viewer: Viewer) {
  if ([viewer.role, viewer.access_role].some((role) => role === "operator" || role === "admin"))
    return json({ error: "運営メンバーにはXPは付与されません" }, 403);
  const input = await readBody(request);
  const action = String(input?.action ?? "") as XpAction;
  const sourceId = typeof input?.sourceId === "string" ? input.sourceId.trim() : "";
  if (!Object.prototype.hasOwnProperty.call(REWARDS, action) || !sourceId || sourceId.length > 200)
    return json({ error: "XP付与内容を確認してください" }, 400);
  if (!await validSource(db, viewer, action, sourceId))
    return json({ error: "XP付与対象を確認できません" }, 403);

  const reward = REWARDS[action];
  const member = await db.prepare("SELECT xp, member_rank FROM members WHERE id = ?").bind(viewer.id)
    .first<{ xp: number | null; member_rank: string }>();
  if (!member) return json({ error: "会員が見つかりません" }, 404);
  const previousXp = Math.max(0, Number(member.xp ?? 0));
  const previousRank = rankFromXp(previousXp);
  const idempotencyKey = `xp:${viewer.id}:${action}:${sourceId}`;
  const now = new Date().toISOString();

  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO xp_operation_requests
      (idempotency_key, member_id, action, source_id, amount, reason, xp_before, rank_before, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(idempotencyKey, viewer.id, action, sourceId, reward.amount, reward.reason, previousXp, previousRank, now),
    db.prepare(`UPDATE members SET xp = xp + ?, member_rank = CASE
      WHEN xp + ? >= 1000 THEN 'platinum' WHEN xp + ? >= 500 THEN 'gold'
      WHEN xp + ? >= 100 THEN 'silver' ELSE 'regular' END, updated_at = ?
      WHERE id = ? AND EXISTS (SELECT 1 FROM xp_operation_requests WHERE idempotency_key = ? AND status = 'pending')`)
      .bind(reward.amount, reward.amount, reward.amount, reward.amount, now, viewer.id, idempotencyKey),
    db.prepare(`UPDATE xp_operation_requests SET status = 'applied', xp_after = xp_before + amount,
      rank_after = CASE WHEN xp_before + amount >= 1000 THEN 'platinum' WHEN xp_before + amount >= 500 THEN 'gold'
      WHEN xp_before + amount >= 100 THEN 'silver' ELSE 'regular' END, completed_at = ?
      WHERE idempotency_key = ? AND status = 'pending'`).bind(now, idempotencyKey),
  ]);

  const operation = await db.prepare(`SELECT amount, reason, xp_before, xp_after, rank_before, rank_after, created_at
    FROM xp_operation_requests WHERE idempotency_key = ?`).bind(idempotencyKey).first<Record<string, unknown>>();
  if (!operation) return json({ error: "XPを更新できませんでした" }, 409);
  return json({
    amount: Number(operation.amount), reason: operation.reason,
    previousXp: Number(operation.xp_before), nextXp: Number(operation.xp_after),
    previousRank: operation.rank_before, nextRank: operation.rank_after,
    duplicate: String(operation.created_at) !== now,
  });
}

export async function handleXpRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== XP_AWARD_ENDPOINT) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer) return json({ error: "ログインが必要です" }, 401);
  return request.method === "POST" ? award(request, env.DB, viewer) : json({ error: "method_not_allowed" }, 405);
}
