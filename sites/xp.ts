import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";
import { rankUpPointAwardStatements, readNewRankUpPointAward } from "./rank-up-points";
import { rankFromXp as rankFromXpCurve } from "../lib/xp-levels";

const XP_AWARD_ENDPOINT = "/api/xp/award";
const REWARDS = {
  event_create: { amount: 10, reason: "イベントの新規作成" },
  board_post: { amount: 5, reason: "掲示板投稿" },
  meal_report_post: { amount: 8, reason: "ごちそうさま報告投稿" },
  chat_message: { amount: 1, reason: "チャット投稿" },
} as const;

type XpAction = keyof typeof REWARDS;
type Viewer = NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
}

export function rankFromXp(xp: number) {
  return rankFromXpCurve(xp);
}

async function validSource(db: D1Database, viewer: Viewer, action: XpAction, sourceId: string) {
  if (action === "event_create") {
    return Boolean(await db.prepare("SELECT id FROM events WHERE id = ? AND organizer_member_id = ? LIMIT 1")
      .bind(sourceId, viewer.id).first());
  }
  if (action === "chat_message") {
    const message = await db.prepare(`SELECT content FROM chat_messages
      WHERE id = ? AND sender_member_id = ? AND deleted_at IS NULL LIMIT 1`)
      .bind(sourceId, viewer.id).first<{ content: string }>();
    return Boolean(message && !message.content.startsWith("【IRO+ システム】") && message.content.replace(/\s/g, "").length >= 10);
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
  // イベント作成XPはイベント作成APIで原子的に処理する。旧クライアントからの
  // 二重付与を防ぐため、この汎用エンドポイントでは受け付けない。
  if (action === "event_create")
    return json({ error: "イベント作成XPはイベント作成時に自動反映されます" }, 409);
  if (!await validSource(db, viewer, action, sourceId))
    return json({ error: "XP付与対象を確認できません" }, 403);

  if (action === "chat_message") {
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
    const start = new Date(`${today}T00:00:00+09:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60_000);
    const daily = await db.prepare(`SELECT COUNT(*) AS count FROM xp_operation_requests
      WHERE member_id = ? AND action = 'chat_message' AND status = 'applied'
        AND created_at >= ? AND created_at < ?`)
      .bind(viewer.id, start.toISOString(), end.toISOString()).first<{ count: number }>();
    if (Number(daily?.count ?? 0) >= 5) return json({ error: "本日のチャットXP上限に達しました" }, 429);
  }

  const reward = REWARDS[action];
  const member = await db.prepare("SELECT xp, member_rank FROM members WHERE id = ?").bind(viewer.id)
    .first<{ xp: number | null; member_rank: string }>();
  if (!member) return json({ error: "会員が見つかりません" }, 404);
  const previousXp = Math.max(0, Number(member.xp ?? 0));
  const previousRank = rankFromXp(previousXp);
  const nextRank = rankFromXp(previousXp + reward.amount);
  const idempotencyKey = `xp:${viewer.id}:${action}:${sourceId}`;
  const now = new Date().toISOString();

  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO xp_operation_requests
      (idempotency_key, member_id, action, source_id, amount, reason, xp_before, rank_before, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(idempotencyKey, viewer.id, action, sourceId, reward.amount, reward.reason, previousXp, previousRank, now),
    db.prepare(`UPDATE members SET xp = COALESCE(xp, 0) + ?, member_rank = ?, updated_at = ?
      WHERE id = ? AND EXISTS (SELECT 1 FROM xp_operation_requests WHERE idempotency_key = ? AND status = 'pending')`)
      .bind(reward.amount, nextRank, now, viewer.id, idempotencyKey),
    db.prepare(`UPDATE xp_operation_requests SET status = 'applied', xp_after = xp_before + amount,
      rank_after = ?, completed_at = ?
      WHERE idempotency_key = ? AND status = 'pending'`).bind(nextRank, now, idempotencyKey),
    ...rankUpPointAwardStatements(db, { memberId: viewer.id, previousRank, nextRank, now }),
  ]);

  const operation = await db.prepare(`SELECT amount, reason, xp_before, xp_after, rank_before, rank_after, created_at
    FROM xp_operation_requests WHERE idempotency_key = ?`).bind(idempotencyKey).first<Record<string, unknown>>();
  if (!operation) return json({ error: "XPを更新できませんでした" }, 409);
  const rankPointAward = await readNewRankUpPointAward(db, {
    memberId: viewer.id,
    previousRank: String(operation.rank_before),
    nextRank: String(operation.rank_after),
    now,
  });
  return json({
    amount: Number(operation.amount), reason: operation.reason,
    previousXp: Number(operation.xp_before), nextXp: Number(operation.xp_after),
    previousRank: operation.rank_before, nextRank: operation.rank_after,
    duplicate: String(operation.created_at) !== now,
    ...(rankPointAward ? { rankPointAward } : {}),
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
