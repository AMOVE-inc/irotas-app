import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";
import { loadImportedDiscordCoupons } from "../lib/discord-benefits-import";

const COUPON_ACTION = /^\/api\/benefits\/coupons\/([^/]+)\/(present|redeem)$/;
const COUPON_ITEM = /^\/api\/benefits\/coupons\/([^/]+)$/;
const GIFT_ACTION = /^\/api\/benefits\/gifts\/([^/]+)\/(apply|lottery)$/;
const GIFT_ITEM = /^\/api\/benefits\/gifts\/([^/]+)$/;
const ROOT = "/api/benefits";
const POINTS_ADJUST = "/api/benefits/points/adjust";
const RANKS = ["regular", "silver", "gold", "platinum"] as const;
const importedCoupons = loadImportedDiscordCoupons();

type Viewer = NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
}

function admin(viewer: Viewer) {
  return viewer.role === "admin" || viewer.access_role === "admin";
}

function elevated(viewer: Viewer) {
  return admin(viewer) || viewer.access_role === "operator";
}

async function body(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 64 * 1024) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function text(value: unknown, max: number, required = true) {
  if (typeof value !== "string") return required ? null : "";
  const result = value.trim();
  return (!result && required) || result.length > max ? null : result;
}

function couponInput(input: Record<string, unknown>) {
  const title = text(input.title, 200);
  const description = text(input.description, 4000, false);
  const discount = text(input.discount, 200);
  const expiresAt = text(input.expiresAt, 10);
  const code = text(input.code, 100);
  const imageUrl = text(input.imageUrl, 2000, false);
  if (!title || description === null || !discount || !expiresAt || !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) || !code || imageUrl === null) return null;
  if (!RANKS.includes(input.requiredRank as typeof RANKS[number])) return null;
  if (!['single', 'multiple'].includes(String(input.usageType))) return null;
  if (!['active', 'ended'].includes(String(input.status ?? 'active'))) return null;
  const recipientIds = Array.isArray(input.recipientIds)
    ? [...new Set(input.recipientIds.filter((id): id is string => typeof id === 'string' && id.length <= 100))].slice(0, 1000)
    : [];
  return { title, description, discount, expiresAt, code, requiredRank: input.requiredRank as string, usageType: input.usageType as string, status: String(input.status ?? 'active'), imageUrl, recipientIds, sourceContestId: text(input.sourceContestId, 160, false) };
}

function giftInput(input: Record<string, unknown>) {
  const title = text(input.title, 200);
  const description = text(input.description, 4000, false);
  const deadline = text(input.deadline, 10);
  const imageEmoji = text(input.imageEmoji, 20);
  const imageUrl = text(input.imageUrl, 2000, false);
  const winnerCount = Number(input.winnerCount);
  if (!title || description === null || !deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !imageEmoji || imageUrl === null || !Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 1000) return null;
  if (!['gourmet', 'non_gourmet'].includes(String(input.category)) || !RANKS.includes(input.minimumRank as typeof RANKS[number]) || !['open', 'closed'].includes(String(input.status))) return null;
  return { title, description, deadline, imageEmoji, imageUrl, winnerCount, category: String(input.category), minimumRank: String(input.minimumRank), status: String(input.status), archivedFromDiscord: input.archivedFromDiscord === true ? 1 : 0 };
}

async function memberRank(db: D1Database, id: number) {
  const row = await db.prepare("SELECT member_rank FROM members WHERE id = ?").bind(id).first<{ member_rank: string }>();
  return row?.member_rank ?? "regular";
}

function couponFromRow(row: Record<string, unknown>) {
  let recipientIds: string[] = [];
  try { recipientIds = JSON.parse(String(row.recipient_ids_json ?? '[]')); } catch {}
  return { id: row.id, title: row.title, description: row.description, discount: row.discount, expiresAt: row.expires_at, code: row.code, requiredRank: row.required_rank, usageType: row.usage_type, status: row.status, imageUrl: row.image_url || undefined, recipientIds: recipientIds.length ? recipientIds : undefined, sourceContestId: row.source_contest_id || undefined };
}

function giftFromRow(row: Record<string, unknown>) {
  return { id: row.id, title: row.title, description: row.description, category: row.category, minimumRank: row.minimum_rank, winnerCount: row.winner_count, deadline: row.deadline, status: row.status, imageEmoji: row.image_emoji, imageUrl: row.image_url || undefined, archivedFromDiscord: Number(row.archived_from_discord) === 1 };
}

async function getBenefits(db: D1Database, viewer: Viewer) {
  const [coupons, usages, gifts, applications, balance, history, balances] = await Promise.all([
    db.prepare("SELECT * FROM coupons ORDER BY expires_at DESC, created_at DESC").all<Record<string, unknown>>(),
    db.prepare("SELECT coupon_id, use_count, last_presented_at, used_at FROM coupon_usages WHERE member_id = ?").bind(viewer.id).all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM gift_campaigns WHERE deleted_at IS NULL ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, deadline").all<Record<string, unknown>>(),
    db.prepare(`SELECT ga.id, ga.campaign_id, ga.applied_at, ga.result, ga.member_id, m.public_member_id, m.display_name
      FROM gift_applications ga JOIN members m ON m.id = ga.member_id
      WHERE ga.member_id = ? OR ? = 1 ORDER BY ga.applied_at DESC`).bind(viewer.id, elevated(viewer) ? 1 : 0).all<Record<string, unknown>>(),
    db.prepare("SELECT balance FROM irotas_point_balances WHERE member_id = ?").bind(viewer.id).first<{ balance: number }>(),
    db.prepare(`SELECT t.id, t.member_id, m.public_member_id, m.display_name, t.amount, t.balance_after, t.reason, t.created_at
      FROM irotas_point_transactions t JOIN members m ON m.id = t.member_id
      WHERE t.member_id = ? OR ? = 1 ORDER BY t.created_at DESC LIMIT 200`).bind(viewer.id, admin(viewer) ? 1 : 0).all<Record<string, unknown>>(),
    admin(viewer) ? db.prepare(`SELECT b.balance, m.public_member_id, b.member_id FROM irotas_point_balances b JOIN members m ON m.id = b.member_id`).all<Record<string, unknown>>() : Promise.resolve({ results: [] }),
  ]);
  return json({
    memberRank: await memberRank(db, viewer.id),
    // Archived Discord coupons are legacy records. A database row (including
    // its deletion tombstone) overrides the archive, so removed items stay gone.
    coupons: [
      ...(coupons.results ?? []).filter((row) => !row.deleted_at).map(couponFromRow),
      ...importedCoupons.filter((coupon) => !(coupons.results ?? []).some((row) => row.id === coupon.id)),
    ],
    usages: Object.fromEntries((usages.results ?? []).map((row) => [String(row.coupon_id), { useCount: Number(row.use_count), lastPresentedAt: row.last_presented_at || undefined, usedAt: row.used_at || undefined }])),
    gifts: (gifts.results ?? []).map(giftFromRow),
    applications: (applications.results ?? []).map((row) => ({ id: row.id, campaignId: row.campaign_id, memberId: row.public_member_id ?? `member-${row.member_id}`, memberName: row.display_name, appliedAt: row.applied_at, result: row.result })),
    points: { balance: Number(balance?.balance ?? 0), balances: Object.fromEntries((balances.results ?? []).map((row) => [String(row.public_member_id ?? `member-${row.member_id}`), Number(row.balance)])), history: history.results ?? [] },
  });
}

async function couponAction(db: D1Database, viewer: Viewer, couponId: string, action: string) {
  let coupon = await db.prepare("SELECT usage_type, status, expires_at, required_rank, recipient_ids_json FROM coupons WHERE id = ? AND deleted_at IS NULL").bind(couponId).first<Record<string, unknown>>();
  if (!coupon) {
    const archived = importedCoupons.find((item) => item.id === couponId);
    if (archived) {
      const now = new Date().toISOString();
      await db.prepare(`INSERT OR IGNORE INTO coupons (id,title,description,discount,expires_at,code,required_rank,usage_type,status,image_url,recipient_ids_json,source_contest_id,created_at,updated_at,deleted_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`)
        .bind(archived.id,archived.title,archived.description,archived.discount,archived.expiresAt,archived.code,archived.requiredRank,archived.usageType,archived.status ?? 'ended',archived.imageUrl ?? null,'[]',archived.sourceContestId ?? null,now,now).run();
      // A soft-deleted row wins over the archive; never reactivate it here.
      coupon = await db.prepare("SELECT usage_type, status, expires_at, required_rank, recipient_ids_json FROM coupons WHERE id = ? AND deleted_at IS NULL").bind(couponId).first<Record<string, unknown>>();
    }
  }
  if (!coupon) return json({ error: "クーポンが見つかりません" }, 404);
  const rank = await memberRank(db, viewer.id);
  let recipients: string[] = [];
  try { recipients = JSON.parse(String(coupon.recipient_ids_json ?? '[]')); } catch {}
  const member = await db.prepare("SELECT public_member_id FROM members WHERE id = ?").bind(viewer.id).first<{ public_member_id: string | null }>();
  if (coupon.status !== 'active' || String(coupon.expires_at) < new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }) || RANKS.indexOf(rank as typeof RANKS[number]) < RANKS.indexOf(coupon.required_rank as typeof RANKS[number]) || (recipients.length && !recipients.includes(member?.public_member_id ?? ''))) return json({ error: "このクーポンは利用できません" }, 409);
  const current = await db.prepare("SELECT use_count, used_at FROM coupon_usages WHERE coupon_id = ? AND member_id = ?").bind(couponId, viewer.id).first<{ use_count: number; used_at: string | null }>();
  if (coupon.usage_type === 'single' && current?.used_at) return json({ error: "このクーポンは使用済みです" }, 409);
  const now = new Date().toISOString();
  if (action === 'present') {
    await db.prepare(`INSERT INTO coupon_usages (coupon_id, member_id, use_count, last_presented_at, updated_at) VALUES (?, ?, 0, ?, ?)
      ON CONFLICT(coupon_id, member_id) DO UPDATE SET last_presented_at = excluded.last_presented_at, updated_at = excluded.updated_at`).bind(couponId, viewer.id, now, now).run();
  } else {
    await db.prepare(`INSERT INTO coupon_usages (coupon_id, member_id, use_count, last_presented_at, used_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)
      ON CONFLICT(coupon_id, member_id) DO UPDATE SET use_count = coupon_usages.use_count + 1, last_presented_at = excluded.last_presented_at, used_at = CASE WHEN ? = 'single' THEN excluded.used_at ELSE coupon_usages.used_at END, updated_at = excluded.updated_at`).bind(couponId, viewer.id, now, now, now, coupon.usage_type).run();
  }
  const usage = await db.prepare("SELECT use_count, last_presented_at, used_at FROM coupon_usages WHERE coupon_id = ? AND member_id = ?").bind(couponId, viewer.id).first<Record<string, unknown>>();
  return json({ success: true, usage: { useCount: Number(usage?.use_count ?? 0), lastPresentedAt: usage?.last_presented_at, usedAt: usage?.used_at } });
}

async function applyGift(db: D1Database, viewer: Viewer, campaignId: string) {
  const campaign = await db.prepare("SELECT minimum_rank, deadline, status FROM gift_campaigns WHERE id = ? AND deleted_at IS NULL").bind(campaignId).first<Record<string, unknown>>();
  if (!campaign) return json({ error: "プレゼント企画が見つかりません" }, 404);
  const rank = await memberRank(db, viewer.id);
  if (campaign.status !== 'open' || String(campaign.deadline) < new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }) || RANKS.indexOf(rank as typeof RANKS[number]) < RANKS.indexOf(campaign.minimum_rank as typeof RANKS[number])) return json({ error: "この企画には申し込めません" }, 409);
  const result = await db.prepare("INSERT OR IGNORE INTO gift_applications (id, campaign_id, member_id, applied_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), campaignId, viewer.id, new Date().toISOString()).run();
  return json({ success: true, alreadyApplied: (result.meta as Record<string, unknown> | undefined)?.changes === 0 });
}

async function runLottery(db: D1Database, viewer: Viewer, campaignId: string) {
  if (!elevated(viewer)) return json({ error: "運営権限が必要です" }, 403);
  const campaign = await db.prepare("SELECT title, winner_count FROM gift_campaigns WHERE id = ? AND deleted_at IS NULL").bind(campaignId).first<{ title: string; winner_count: number }>();
  if (!campaign) return json({ error: "プレゼント企画が見つかりません" }, 404);
  const pending = await db.prepare("SELECT id, member_id FROM gift_applications WHERE campaign_id = ? AND result = 'pending' ORDER BY applied_at, id").bind(campaignId).all<{ id: string; member_id: number }>();
  const shuffled = [...(pending.results ?? [])];
  for (let i = shuffled.length - 1; i > 0; i--) { const bytes = crypto.getRandomValues(new Uint32Array(1)); const j = bytes[0] % (i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const winners = new Set(shuffled.slice(0, campaign.winner_count).map((item) => item.id));
  const now = new Date().toISOString();
  await db.batch([
    ...shuffled.map((item) => db.prepare("UPDATE gift_applications SET result = ?, decided_at = ? WHERE id = ? AND result = 'pending'").bind(winners.has(item.id) ? 'winner' : 'not_selected', now, item.id)),
    ...shuffled.map((item) => db.prepare(`INSERT INTO in_app_notifications (id, target_member_id, type, title, body, created_at) VALUES (?, ?, 'coupon', ?, ?, ?)`)
      .bind(crypto.randomUUID(), item.member_id, winners.has(item.id) ? "プレゼント企画に当選しました" : "プレゼント企画の抽選結果", winners.has(item.id) ? `「${campaign.title}」に当選しました。運営からの案内をご確認ください。` : `「${campaign.title}」の抽選結果が確定しました。`, now)),
    db.prepare("UPDATE gift_campaigns SET status = 'closed', updated_at = ? WHERE id = ?").bind(now, campaignId),
  ]);
  return json({ success: true, winnerIds: shuffled.filter((item) => winners.has(item.id)).map((item) => item.id) });
}

async function adjustPoints(request: Request, db: D1Database, viewer: Viewer) {
  const input = await body(request);
  if (!input) return json({ error: "入力内容を確認してください" }, 400);
  const amount = Number(input.amount);
  const reason = text(input.reason, 500);
  const idempotencyKey = text(input.idempotencyKey, 200);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000 || !reason || !idempotencyKey) return json({ error: "ポイント変更内容を確認してください" }, 400);
  let targetId = viewer.id;
  if (input.memberId !== undefined && String(input.memberId) !== '') {
    if (!admin(viewer)) return json({ error: "管理者権限が必要です" }, 403);
    const target = await db.prepare("SELECT id FROM members WHERE public_member_id = ? OR CAST(id AS TEXT) = ? LIMIT 1").bind(String(input.memberId), String(input.memberId)).first<{ id: number }>();
    if (!target) return json({ error: "会員が見つかりません" }, 404);
    targetId = target.id;
  } else if (amount > 0 && !admin(viewer)) return json({ error: "ポイント付与は管理者のみ可能です" }, 403);
  const now = new Date().toISOString();
  const transactionId = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO irotas_point_balances (member_id, balance, updated_at) VALUES (?, 0, ?)").bind(targetId, now),
      db.prepare(`INSERT OR IGNORE INTO irotas_point_operation_requests
        (idempotency_key, member_id, actor_member_id, amount, reason, balance_before, transaction_id, created_at)
        SELECT ?, ?, ?, ?, ?, balance, ?, ? FROM irotas_point_balances WHERE member_id = ?`)
        .bind(idempotencyKey, targetId, viewer.id, amount, reason, transactionId, now, targetId),
      db.prepare(`UPDATE irotas_point_balances SET balance = balance + ?, updated_at = ?
        WHERE member_id = ? AND EXISTS (SELECT 1 FROM irotas_point_operation_requests r
          WHERE r.idempotency_key = ? AND r.status = 'pending' AND r.balance_before + r.amount >= 0)`)
        .bind(amount, now, targetId, idempotencyKey),
      db.prepare(`UPDATE irotas_point_operation_requests
        SET status = CASE WHEN balance_before + amount >= 0 THEN 'applied' ELSE 'rejected' END,
            balance_after = CASE WHEN balance_before + amount >= 0 THEN balance_before + amount ELSE balance_before END,
            completed_at = ? WHERE idempotency_key = ? AND status = 'pending'`).bind(now, idempotencyKey),
      db.prepare(`INSERT OR IGNORE INTO irotas_point_transactions
        (id, member_id, actor_member_id, amount, balance_after, reason, idempotency_key, created_at)
        SELECT transaction_id, member_id, actor_member_id, amount, balance_after, reason, idempotency_key, ?
        FROM irotas_point_operation_requests WHERE idempotency_key = ? AND status = 'applied'`).bind(now, idempotencyKey),
    ]);
  } catch {
    return json({ error: "ポイントを更新できませんでした" }, 409);
  }
  const operation = await db.prepare("SELECT status, balance_after, transaction_id FROM irotas_point_operation_requests WHERE idempotency_key = ?").bind(idempotencyKey).first<{ status: string; balance_after: number; transaction_id: string }>();
  if (!operation || operation.status === 'rejected') return json({ error: "ポイント残高が不足しています" }, 409);
  return json({ success: true, balance: operation.balance_after, transactionId: operation.transaction_id, duplicate: operation.transaction_id !== transactionId });
}

export async function handleBenefitsRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const couponActionMatch = COUPON_ACTION.exec(pathname);
  const couponItemMatch = COUPON_ITEM.exec(pathname);
  const giftActionMatch = GIFT_ACTION.exec(pathname);
  const giftItemMatch = GIFT_ITEM.exec(pathname);
  if (pathname !== ROOT && pathname !== POINTS_ADJUST && !couponActionMatch && !couponItemMatch && !giftActionMatch && !giftItemMatch) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer) return json({ error: "ログインが必要です" }, 401);
  if (pathname === ROOT) return request.method === 'GET' ? getBenefits(env.DB, viewer) : json({ error: 'method_not_allowed' }, 405);
  if (pathname === POINTS_ADJUST) return request.method === 'POST' ? adjustPoints(request, env.DB, viewer) : json({ error: 'method_not_allowed' }, 405);
  if (couponActionMatch) return request.method === 'POST' ? couponAction(env.DB, viewer, decodeURIComponent(couponActionMatch[1]), couponActionMatch[2]) : json({ error: 'method_not_allowed' }, 405);
  if (giftActionMatch) return request.method === 'POST' ? (giftActionMatch[2] === 'apply' ? applyGift(env.DB, viewer, decodeURIComponent(giftActionMatch[1])) : runLottery(env.DB, viewer, decodeURIComponent(giftActionMatch[1]))) : json({ error: 'method_not_allowed' }, 405);
  if (couponItemMatch) {
    if (!elevated(viewer)) return json({ error: "運営権限が必要です" }, 403);
    const id = decodeURIComponent(couponItemMatch[1]);
    if (request.method === 'DELETE') {
      const now = new Date().toISOString();
      const archived = importedCoupons.find((coupon) => coupon.id === id);
      if (archived) {
        await env.DB.prepare(`INSERT INTO coupons (id,title,description,discount,expires_at,code,required_rank,usage_type,status,image_url,recipient_ids_json,source_contest_id,created_at,updated_at,deleted_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET deleted_at=excluded.deleted_at,updated_at=excluded.updated_at`)
          .bind(id,archived.title,archived.description,archived.discount,archived.expiresAt,archived.code,archived.requiredRank,archived.usageType,archived.status ?? 'ended',archived.imageUrl ?? null,'[]',archived.sourceContestId ?? null,now,now,now).run();
      } else {
        await env.DB.prepare("UPDATE coupons SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id).run();
      }
      return json({ success: true });
    }
    if (!['PUT', 'PATCH'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
    const input = await body(request); const value = input && couponInput(input);
    if (!value) return json({ error: "クーポンの入力内容を確認してください" }, 400);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO coupons (id,title,description,discount,expires_at,code,required_rank,usage_type,status,image_url,recipient_ids_json,source_contest_id,created_at,updated_at,deleted_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,discount=excluded.discount,expires_at=excluded.expires_at,code=excluded.code,required_rank=excluded.required_rank,usage_type=excluded.usage_type,status=excluded.status,image_url=excluded.image_url,recipient_ids_json=excluded.recipient_ids_json,source_contest_id=excluded.source_contest_id,updated_at=excluded.updated_at,deleted_at=NULL`).bind(id,value.title,value.description,value.discount,value.expiresAt,value.code,value.requiredRank,value.usageType,value.status,value.imageUrl || null,JSON.stringify(value.recipientIds),value.sourceContestId || null,now,now).run();
    return json({ success: true });
  }
  if (giftItemMatch) {
    if (!elevated(viewer)) return json({ error: "運営権限が必要です" }, 403);
    const id = decodeURIComponent(giftItemMatch[1]);
    if (request.method === 'DELETE') { await env.DB.prepare("UPDATE gift_campaigns SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), id).run(); return json({ success: true }); }
    if (!['PUT', 'PATCH'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
    const input = await body(request); const value = input && giftInput(input);
    if (!value) return json({ error: "プレゼント企画の入力内容を確認してください" }, 400);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO gift_campaigns (id,title,description,category,minimum_rank,winner_count,deadline,status,image_emoji,image_url,archived_from_discord,created_at,updated_at,deleted_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,minimum_rank=excluded.minimum_rank,winner_count=excluded.winner_count,deadline=excluded.deadline,status=excluded.status,image_emoji=excluded.image_emoji,image_url=excluded.image_url,archived_from_discord=excluded.archived_from_discord,updated_at=excluded.updated_at,deleted_at=NULL`).bind(id,value.title,value.description,value.category,value.minimumRank,value.winnerCount,value.deadline,value.status,value.imageEmoji,value.imageUrl || null,value.archivedFromDiscord,now,now).run();
    return json({ success: true });
  }
  return null;
}
