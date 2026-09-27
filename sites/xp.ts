import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";
import { rankUpPointAwardStatements, readNewRankUpPointAward } from "./rank-up-points";
import { rankFromXp as rankFromXpCurve } from "../lib/xp-levels";

const XP_AWARD_ENDPOINT = "/api/xp/award";
const REWARDS = {
  board_post: { amount: 20, reason: "掲示板投稿" },
  meal_report_post: { amount: 30, reason: "ごちそうさま報告投稿" },
  chat_message: { amount: 10, reason: "チャット投稿" },
  comment: { amount: 5, reason: "コメント投稿" },
} as const;

export type XpAction = keyof typeof REWARDS;
type Viewer = NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>;
type Source = { content: string; createdAt: string };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
}

export function rankFromXp(xp: number) { return rankFromXpCurve(xp); }
const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ja").replace(/\s+/g, "").trim();

export function xpContentEligible(content: string, previousContents: string[]) {
  const value = normalized(content);
  return value.length >= 10 && !previousContents.some((item) => normalized(item) === value);
}

async function sourceAndPeers(db: D1Database, viewer: Viewer, action: XpAction, sourceId: string): Promise<{ source: Source; peers: Source[] } | null> {
  if (action === "chat_message") {
    const source = await db.prepare(`SELECT content, created_at AS createdAt FROM chat_messages
      WHERE id = ? AND sender_member_id = ? AND deleted_at IS NULL LIMIT 1`).bind(sourceId, viewer.id).first<Source>();
    if (!source || source.content.startsWith("【IRO+ システム】")) return null;
    const peers = await db.prepare(`SELECT content, created_at AS createdAt FROM chat_messages
      WHERE sender_member_id = ? AND id != ? AND deleted_at IS NULL AND created_at <= ?
      ORDER BY created_at DESC LIMIT 100`).bind(viewer.id, sourceId, source.createdAt).all<Source>();
    return { source, peers: peers.results ?? [] };
  }
  if (action === "comment") {
    const source = await db.prepare(`SELECT content, created_at AS createdAt FROM board_comments
      WHERE id = ? AND author_member_id = ? AND deleted_at IS NULL LIMIT 1`).bind(sourceId, viewer.id).first<Source>();
    if (!source) return null;
    const peers = await db.prepare(`SELECT content, created_at AS createdAt FROM board_comments
      WHERE author_member_id = ? AND id != ? AND deleted_at IS NULL AND created_at <= ?
      ORDER BY created_at DESC LIMIT 100`).bind(viewer.id, sourceId, source.createdAt).all<Source>();
    return { source, peers: peers.results ?? [] };
  }
  const row = await db.prepare(`SELECT title || ' ' || content AS content, created_at AS createdAt, category
    FROM board_threads WHERE id = ? AND author_member_id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(sourceId, viewer.id).first<Source & { category: string }>();
  if (!row || (action === "meal_report_post" ? row.category !== "meal-report" : row.category === "meal-report")) return null;
  const peers = await db.prepare(`SELECT title || ' ' || content AS content, created_at AS createdAt FROM board_threads
    WHERE author_member_id = ? AND id != ? AND deleted_at IS NULL AND category = ? AND created_at <= ?
    ORDER BY created_at DESC LIMIT 100`).bind(viewer.id, sourceId, row.category, row.createdAt).all<Source>();
  return { source: row, peers: peers.results ?? [] };
}

function tokyoDayBounds(now = new Date()) {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now);
  const start = new Date(`${day}T00:00:00+09:00`);
  return [start.toISOString(), new Date(start.getTime() + 86_400_000).toISOString()] as const;
}

async function readBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8 * 1024) return null;
  try { const value = JSON.parse(raw); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
}

export async function reverseSharedXpForSource(db: D1Database, action: XpAction, sourceId: string, now = new Date().toISOString()) {
  const operation = await db.prepare(`SELECT idempotency_key, member_id, amount FROM xp_operation_requests
    WHERE action = ? AND source_id = ? AND status = 'applied' LIMIT 1`).bind(action, sourceId)
    .first<{ idempotency_key: string; member_id: number; amount: number }>();
  if (!operation) return false;
  const member = await db.prepare("SELECT xp FROM members WHERE id = ?").bind(operation.member_id).first<{ xp: number | null }>();
  if (!member) return false;
  const nextXp = Math.max(0, Number(member.xp ?? 0) - Number(operation.amount));
  await db.batch([
    db.prepare(`UPDATE members SET xp = ?, member_rank = ?, updated_at = ? WHERE id = ?
      AND EXISTS (SELECT 1 FROM xp_operation_requests WHERE idempotency_key = ? AND status = 'applied')`)
      .bind(nextXp, rankFromXp(nextXp), now, operation.member_id, operation.idempotency_key),
    db.prepare(`UPDATE xp_operation_requests SET status = 'reversed', reversed_at = ?
      WHERE idempotency_key = ? AND status = 'applied'`).bind(now, operation.idempotency_key),
  ]);
  return true;
}

async function award(request: Request, db: D1Database, viewer: Viewer) {
  if ([viewer.role, viewer.access_role].some((role) => role === "operator" || role === "admin")) return json({ error: "運営メンバーにはXPは付与されません" }, 403);
  const input = await readBody(request);
  const action = String(input?.action ?? "") as XpAction;
  const sourceId = typeof input?.sourceId === "string" ? input.sourceId.trim() : "";
  if (!Object.prototype.hasOwnProperty.call(REWARDS, action) || !sourceId || sourceId.length > 200) return json({ error: "XP付与内容を確認してください" }, 400);
  const sourceData = await sourceAndPeers(db, viewer, action, sourceId);
  if (!sourceData) return json({ error: "XP付与対象を確認できません" }, 403);
  const sourceText = normalized(sourceData.source.content);
  if (sourceText.length < 10) return json({ error: "短すぎる投稿はXP対象外です" }, 422);
  if (!xpContentEligible(sourceData.source.content, sourceData.peers.map((item) => item.content))) return json({ error: "同じ内容の投稿はXP対象外です" }, 422);

  if (action === "chat_message" || action === "comment") {
    const [start, end] = tokyoDayBounds();
    const daily = await db.prepare(`SELECT COUNT(*) AS count FROM xp_operation_requests
      WHERE member_id = ? AND action = ? AND status = 'applied' AND created_at >= ? AND created_at < ?`)
      .bind(viewer.id, action, start, end).first<{ count: number }>();
    if (Number(daily?.count ?? 0) >= 5) return json({ error: `本日の${action === "comment" ? "コメント" : "チャット"}XP上限に達しました` }, 429);
  }

  const reward = REWARDS[action];
  const member = await db.prepare("SELECT xp, member_rank FROM members WHERE id = ?").bind(viewer.id).first<{ xp: number | null; member_rank: string }>();
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
      rank_after = ?, completed_at = ?, reversed_at = NULL WHERE idempotency_key = ? AND status = 'pending'`).bind(nextRank, now, idempotencyKey),
    ...rankUpPointAwardStatements(db, { memberId: viewer.id, previousRank, nextRank, now }),
  ]);
  const operation = await db.prepare(`SELECT amount, reason, xp_before, xp_after, rank_before, rank_after, created_at
    FROM xp_operation_requests WHERE idempotency_key = ?`).bind(idempotencyKey).first<Record<string, unknown>>();
  if (!operation) return json({ error: "XPを更新できませんでした" }, 409);
  const rankPointAward = await readNewRankUpPointAward(db, { memberId: viewer.id, previousRank: String(operation.rank_before), nextRank: String(operation.rank_after), now });
  return json({ amount: Number(operation.amount), reason: operation.reason, previousXp: Number(operation.xp_before), nextXp: Number(operation.xp_after), previousRank: operation.rank_before, nextRank: operation.rank_after, duplicate: String(operation.created_at) !== now, ...(rankPointAward ? { rankPointAward } : {}) });
}

export async function handleXpRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== XP_AWARD_ENDPOINT) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer) return json({ error: "ログインが必要です" }, 401);
  return request.method === "POST" ? award(request, env.DB, viewer) : json({ error: "method_not_allowed" }, 405);
}
