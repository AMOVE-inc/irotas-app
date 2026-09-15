import { authenticatedRequestMember, effectiveMemberRank } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";
import { PUBLIC_APP_URL } from "../constants/external-links";

const CHECKOUT_PATH = /^\/api\/events\/([^/]+)\/checkout$/;
const ADMIN_PAYMENTS_PATH = "/api/admin/event-payments";
const SQUARE_VERSION = "2026-08-19";
let discoveredSquareLocationId: string | null = null;

type CheckoutRow = {
  id: string;
  event_id: string;
  member_id: number;
  item_name: string;
  amount_yen: number;
  points_used: number;
  status: "creating" | "ready" | "paid" | "cancelled";
  square_order_id: string | null;
  square_payment_link_id?: string | null;
  checkout_url: string | null;
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

function priceYen(value: unknown): number | null {
  const normalized = String(value ?? "").normalize("NFKC").replace(/,/g, "").trim();
  if (!normalized || /^(無料|0円?)$/.test(normalized)) return 0;
  const match = /^(?:¥|￥)?\s*(\d+)(?:円)?$/.exec(normalized);
  return match ? Number(match[1]) : null;
}

export function eventCheckoutAmount(data: Record<string, unknown>, memberRank: string, pointsUsed: number) {
  const rankPrices = data.rankPrices && typeof data.rankPrices === "object" && !Array.isArray(data.rankPrices)
    ? data.rankPrices as Record<string, unknown> : {};
  const base = priceYen(rankPrices[memberRank] ?? data.price);
  if (base === null || !Number.isInteger(base) || base < 0 || base > 300_000 ||
      !Number.isInteger(pointsUsed) || pointsUsed < 0 || pointsUsed > base) return null;
  return base - pointsUsed;
}

async function squareLocationId(env: SitesEnv) {
  if (env.SQUARE_LOCATION_ID?.trim()) return env.SQUARE_LOCATION_ID.trim();
  if (discoveredSquareLocationId) return discoveredSquareLocationId;
  if (!env.SQUARE_ACCESS_TOKEN) return null;
  let response: Response;
  try {
    response = await fetch("https://connect.squareup.com/v2/locations", {
      headers: { authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "square-version": SQUARE_VERSION },
    });
  } catch { return null; }
  if (!response.ok) return null;
  const result = await response.json().catch(() => ({})) as { locations?: Array<{ id?: string; status?: string; capabilities?: string[] }> };
  const active = (result.locations ?? []).filter((location) => location.id && location.status !== "INACTIVE");
  const paymentCapable = active.filter((location) => !location.capabilities || location.capabilities.includes("CREDIT_CARD_PROCESSING"));
  discoveredSquareLocationId = paymentCapable[0]?.id ?? active[0]?.id ?? null;
  return discoveredSquareLocationId;
}

export async function handleAdminEventPaymentsRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== ADMIN_PAYMENTS_PATH) return null;
  if (request.method !== "GET") return json({ error: "対応していない操作です" }, 405);
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);
  if (member.role !== "admin" && member.access_role !== "admin") return json({ error: "管理者権限が必要です" }, 403);
  const result = await env.DB.prepare(`SELECT epc.id, epc.event_id AS eventId, e.title AS eventTitle,
    COALESCE(m.public_member_id, 'member-' || m.id) AS memberId, m.display_name AS memberName,
    epc.amount_yen AS amountYen, epc.points_used AS pointsUsed, epc.status,
    epc.created_at AS createdAt, epc.paid_at AS paidAt, epc.cancelled_at AS cancelledAt
    FROM event_payment_checkouts epc
    JOIN events e ON e.id = epc.event_id JOIN members m ON m.id = epc.member_id
    ORDER BY epc.updated_at DESC LIMIT 200`).all();
  return json({ payments: result.results ?? [] });
}

async function checkoutRow(db: D1Database, eventId: string, memberId: number) {
  return db.prepare(`SELECT id, event_id, member_id, item_name, amount_yen, points_used, status,
    square_payment_link_id, square_order_id, checkout_url
    FROM event_payment_checkouts WHERE event_id = ? AND member_id = ? LIMIT 1`)
    .bind(eventId, memberId).first<CheckoutRow>();
}

/** 決済待ち申込の取消前にSquareリンクを無効化する。失敗時は申込を維持する。 */
export async function cancelEventCheckout(db: D1Database, env: SitesEnv, eventId: string, memberId: number) {
  const checkout = await checkoutRow(db, eventId, memberId);
  if (!checkout) return true;
  if (checkout.status === "paid") return false;
  if (checkout.status === "cancelled") return true;
  if (checkout.status === "ready" && !checkout.square_payment_link_id) return false;
  if (checkout.status === "ready" && checkout.square_payment_link_id) {
    if (!env.SQUARE_ACCESS_TOKEN) return false;
    let response: Response;
    try {
      response = await fetch(`https://connect.squareup.com/v2/online-checkout/payment-links/${encodeURIComponent(checkout.square_payment_link_id)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "square-version": SQUARE_VERSION },
      });
    } catch { return false; }
    if (!response.ok) return false;
  }
  await db.prepare(`UPDATE event_payment_checkouts SET status = 'cancelled', checkout_url = NULL,
    cancelled_at = ?, updated_at = ? WHERE id = ? AND status IN ('creating','ready')`)
    .bind(new Date().toISOString(), new Date().toISOString(), checkout.id).run();
  const current = await checkoutRow(db, eventId, memberId);
  return current?.status === "cancelled";
}

export async function handleEventCheckoutRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const match = CHECKOUT_PATH.exec(new URL(request.url).pathname);
  if (!match) return null;
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "対応していない操作です" }, 405);
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  if (env.EVENT_PAYMENTS_ENABLED !== "true") return json({ error: "公式イベントのアプリ内決済は現在停止しています" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);
  const eventId = decodeURIComponent(match[1]);
  const event = await env.DB.prepare(`SELECT id, title, event_type, status, public_data_json
    FROM events WHERE id = ? LIMIT 1`).bind(eventId)
    .first<{ id: string; title: string; event_type: string; status: string; public_data_json: string }>();
  if (!event || event.event_type !== "official") return json({ error: "対象の公式イベントが見つかりません" }, 404);
  if (event.status === "cancelled") return json({ error: "中止されたイベントです" }, 409);
  const participation = await env.DB.prepare(`SELECT status, payment_state FROM event_participations
    WHERE event_id = ? AND member_id = ? LIMIT 1`).bind(eventId, member.id)
    .first<{ status: string; payment_state: string | null }>();
  const awaitingPayment = participation?.status === "applied" && participation.payment_state === "awaiting_payment";
  if (!awaitingPayment && participation?.status !== "confirmed" && participation?.status !== "cancel_requested")
    return json({ error: "支払い対象の参加申込がありません" }, 403);
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(event.public_data_json) as Record<string, unknown>; } catch {}
  if (data.recruitmentChannel === "discord" || eventId.startsWith("discord-event-"))
    return json({ error: "このイベントはアプリ決済の対象外です" }, 409);
  const rank = await env.DB.prepare("SELECT member_rank, discord_roles_json FROM members WHERE id = ? LIMIT 1")
    .bind(member.id).first<{ member_rank: string | null; discord_roles_json: string | null }>();
  const points = await env.DB.prepare(`SELECT amount FROM event_point_usages
    WHERE event_id = ? AND member_id = ? AND status = 'applied' LIMIT 1`)
    .bind(eventId, member.id).first<{ amount: number }>();
  const pointsUsed = Number(points?.amount ?? 0);
  const existing = await checkoutRow(env.DB, eventId, member.id);
  if (existing?.status === "paid")
    return json({ status: "paid", amountYen: existing.amount_yen, pointsUsed: existing.points_used });
  if (existing?.status === "cancelled") return json({ error: "この決済リンクは無効です" }, 409);
  if (awaitingPayment && !existing) return json({ error: "決済対象を確認できません" }, 409);
  const amount = awaitingPayment && existing ? existing.amount_yen
    : eventCheckoutAmount(data, effectiveMemberRank(rank?.member_rank, rank?.discord_roles_json) ?? "regular", pointsUsed);
  if (amount === null) return json({ error: "参加費を確認できません" }, 409);
  if (existing && (existing.amount_yen !== amount || existing.points_used !== pointsUsed))
    return json({ error: "参加費が変更されています。運営へお問い合わせください" }, 409);
  if (amount === 0) return json({ status: "free", amountYen: 0, pointsUsed });
  if (existing?.status === "ready" && existing.checkout_url)
    return json({ status: "ready", amountYen: amount, pointsUsed, checkoutUrl: existing.checkout_url });
  if (request.method === "GET") return json({ status: existing?.status ?? "unstarted", amountYen: amount, pointsUsed });
  if (!env.SQUARE_ACCESS_TOKEN)
    return json({ error: "Square決済の設定が未完了です" }, 503);
  const locationId = await squareLocationId(env);
  if (!locationId) return json({ error: "Square決済店舗を確認できませんでした" }, 503);

  const now = new Date().toISOString();
  const itemName = `IRO+ ${event.title}`.slice(0, 255);
  await env.DB.prepare(`INSERT OR IGNORE INTO event_payment_checkouts
    (id, event_id, member_id, item_name, amount_yen, points_used, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'creating', ?, ?)`).bind(
      crypto.randomUUID(), eventId, member.id, itemName, amount, pointsUsed, now, now,
    ).run();
  const checkout = await checkoutRow(env.DB, eventId, member.id);
  if (!checkout || checkout.amount_yen !== amount || checkout.points_used !== pointsUsed)
    return json({ error: "参加費が変更されています。運営へお問い合わせください" }, 409);
  if (checkout.status === "paid") return json({ status: "paid", amountYen: amount, pointsUsed });
  if (checkout.status === "ready" && checkout.checkout_url)
    return json({ status: "ready", amountYen: amount, pointsUsed, checkoutUrl: checkout.checkout_url });
  let response: Response;
  const returnUrl = new URL("/event-detail", PUBLIC_APP_URL);
  returnUrl.searchParams.set("id", eventId);
  try {
    response = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: { authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "square-version": SQUARE_VERSION, "content-type": "application/json" },
      body: JSON.stringify({
        idempotency_key: checkout.id,
        quick_pay: { name: checkout.item_name, price_money: { amount: checkout.amount_yen, currency: "JPY" }, location_id: locationId },
        checkout_options: { allow_tipping: false, ask_for_shipping_address: false, enable_coupon: false, enable_loyalty: false, redirect_url: returnUrl.toString() },
      }),
    });
  } catch {
    return json({ error: "Square決済ページを作成できませんでした" }, 502);
  }
  if (!response.ok) return json({ error: "Square決済ページを作成できませんでした" }, 502);
  const result = await response.json().catch(() => ({})) as { payment_link?: { id?: string; order_id?: string; url?: string } };
  const link = result.payment_link;
  let validUrl = false;
  try { const url = new URL(link?.url ?? ""); validUrl = url.protocol === "https:" && url.hostname === "square.link"; } catch {}
  if (!link?.id || !link.order_id || !validUrl) return json({ error: "Square決済ページの応答を確認できません" }, 502);
  const revokeCreatedLink = async () => {
    const revoked = await fetch(`https://connect.squareup.com/v2/online-checkout/payment-links/${encodeURIComponent(link.id!)}`, {
      method: "DELETE", headers: { authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "square-version": SQUARE_VERSION },
    }).then((result) => result.ok).catch(() => false);
    if (!revoked) await env.DB!.prepare(`INSERT INTO audit_logs (action, entity_type, entity_id, metadata_json, created_at)
      VALUES ('event.payment_link_delete_failed', 'event_payment_checkout', ?, ?, ?)`).bind(
        checkout.id, JSON.stringify({ eventId, memberId: member.id, squareOrderId: link.order_id }), new Date().toISOString(),
      ).run().catch(() => undefined);
  };
  let finalCheckout: CheckoutRow | null;
  try {
    await env.DB.prepare(`UPDATE event_payment_checkouts SET status = 'ready', square_payment_link_id = ?,
      square_order_id = ?, checkout_url = ?, updated_at = ? WHERE id = ? AND status = 'creating'`)
      .bind(link.id, link.order_id, link.url, new Date().toISOString(), checkout.id).run();
    finalCheckout = await checkoutRow(env.DB, eventId, member.id);
  } catch {
    await revokeCreatedLink();
    return json({ error: "決済ページの保存状態を確認できません" }, 502);
  }
  if (finalCheckout?.status === "cancelled") {
    await revokeCreatedLink();
    return json({ error: "申込が取り消されました" }, 409);
  }
  if (finalCheckout?.status !== "ready" || finalCheckout.square_order_id !== link.order_id) {
    await revokeCreatedLink();
    return json({ error: "決済ページの保存状態を確認できません" }, 502);
  }
  return json({ status: "ready", amountYen: amount, pointsUsed, checkoutUrl: link.url });
}
