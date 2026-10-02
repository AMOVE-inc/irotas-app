import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";
import { squareApiUrl } from "./square-environment";

type SquareSubscription = {
  id?: string;
  customer_id?: string;
  plan_variation_id?: string;
  status?: string;
  start_date?: string;
  charged_through_date?: string;
  paid_until_date?: string;
};

type SquareRetrieveResponse = {
  subscription?: SquareSubscription;
  errors?: { detail?: string }[];
};

type SquareSearchResponse = {
  subscriptions?: SquareSubscription[];
  cursor?: string;
  errors?: { detail?: string }[];
};

const SQUARE_VERSION = "2026-07-15";
export const SQUARE_SYNC_BATCH_SIZE = 40;
export const SQUARE_SEARCH_PAGE_SIZE = 100;
const SQUARE_SEARCH_MAX_PAGES = 100;
const VALID_STATUSES = new Set([
  "PENDING",
  "ACTIVE",
  "CANCELED",
  "DEACTIVATED",
  "PAUSED",
  "COMPLETED",
]);

/** The worker wakes every 15 minutes; a full Square scan runs once per hour. */
export function shouldRunScheduledSquareSubscriptionSync(scheduledTime = Date.now()) {
  return new Date(scheduledTime).getUTCMinutes() === 0;
}

export function isStrictAdmin(member: {
  role: string;
  access_role: string;
} | null) {
  return Boolean(
    member && (member.role === "admin" || member.access_role === "admin"),
  );
}

export function subscriptionAccessState(
  subscription: SquareSubscription,
  allowedPlanIds: Set<string>,
) {
  const status = VALID_STATUSES.has(subscription.status ?? "")
    ? subscription.status!
    : "UNKNOWN";
  const planAllowed =
    allowedPlanIds.size === 0 ||
    Boolean(
      subscription.plan_variation_id &&
        allowedPlanIds.has(subscription.plan_variation_id),
    );
  const paidUntil =
    subscription.paid_until_date ?? subscription.charged_through_date ?? null;

  if (!planAllowed || ["PAUSED", "CANCELED", "DEACTIVATED", "COMPLETED"].includes(status)) {
    return { status, accessStatus: "suspended", paidUntil, graceUntil: null };
  }
  if (status !== "ACTIVE") {
    return { status, accessStatus: "pending", paidUntil, graceUntil: null };
  }
  // Square can keep charged_through_date in the past while a subscription is ACTIVE.
  // Payment failures enter grace through invoice webhooks instead of this date.
  return { status, accessStatus: "active", paidUntil, graceUntil: null };
}

async function retrieveRegisteredSubscriptions(
  db: D1Database,
  env: SitesEnv,
  offset: number,
) {
  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM member_subscriptions
       WHERE square_subscription_id IS NOT NULL AND square_subscription_id != ''`,
    )
    .first<{ count: number }>();
  const total = Number(countRow?.count ?? 0);
  const result = await db
    .prepare(
      `SELECT square_subscription_id
       FROM member_subscriptions
       WHERE square_subscription_id IS NOT NULL AND square_subscription_id != ''
       ORDER BY id
       LIMIT ? OFFSET ?`,
    )
    .bind(SQUARE_SYNC_BATCH_SIZE, offset)
    .all<{ square_subscription_id: string }>();
  const ids = (result.results ?? []).map((row) => row.square_subscription_id);
  const subscriptions: SquareSubscription[] = [];
  let failed = 0;

  for (let index = 0; index < ids.length; index += 20) {
    const batch = ids.slice(index, index + 20);
    const responses = await Promise.all(
      batch.map(async (id) => {
        const response = await fetch(
          squareApiUrl(env, `/v2/subscriptions/${encodeURIComponent(id)}`),
          {
            headers: {
              authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
              "content-type": "application/json",
              "square-version": SQUARE_VERSION,
            },
          },
        );
        const body = (await response.json().catch(() => ({}))) as SquareRetrieveResponse;
        if ([401, 403].includes(response.status))
          throw new Error(body.errors?.[0]?.detail ?? `square_${response.status}`);
        return response.ok ? body.subscription ?? null : null;
      }),
    );
    for (const subscription of responses) {
      if (subscription) subscriptions.push(subscription);
      else failed += 1;
    }
  }
  const nextOffset = offset + ids.length;
  return {
    subscriptions,
    scanned: ids.length,
    failed,
    total,
    nextOffset,
    hasMore: nextOffset < total,
  };
}

async function reconcileSubscriptions(
  db: D1Database,
  subscriptions: SquareSubscription[],
  allowedPlanIds: Set<string>,
  now: string,
) {
  const statements = subscriptions.flatMap((subscription) => {
    if (!subscription.id) return [];
    const state = subscriptionAccessState(subscription, allowedPlanIds);
    return [
      db
        .prepare(
          `UPDATE member_subscriptions
           SET square_customer_id = COALESCE(NULLIF(?, ''), square_customer_id),
               plan_variation_id = COALESCE(NULLIF(?, ''), plan_variation_id),
               square_status = ?,
               access_status = CASE
                 WHEN ? = 'active' AND access_status = 'grace' AND grace_until_date IS NOT NULL THEN 'grace'
                 ELSE ?
               END,
               paid_until_date = ?,
               grace_until_date = CASE
                 WHEN ? = 'active' AND access_status = 'grace' AND grace_until_date IS NOT NULL THEN grace_until_date
                 ELSE ?
               END,
               subscription_started_at = COALESCE(subscription_started_at, ?),
               last_verified_at = ?, updated_at = ?
           WHERE square_subscription_id = ?`,
        )
        .bind(
          subscription.customer_id ?? "",
          subscription.plan_variation_id ?? "",
          state.status,
          state.accessStatus,
          state.accessStatus,
          state.paidUntil,
          state.accessStatus,
          state.graceUntil,
          subscription.start_date ?? null,
          now,
          now,
          subscription.id,
        ),
    ];
  });
  if (!statements.length) return 0;
  const results = await db.batch(statements);
  return results.reduce((count, result) => {
    const changes = Number(result.meta?.changes ?? 0);
    return count + (Number.isFinite(changes) ? changes : 0);
  }, 0);
}

/**
 * Periodic safety net for missed Square webhooks. Search is paged so all
 * Square subscriptions are checked with far fewer API calls than retrieving
 * each registered subscription individually.
 */
export async function reconcileAllSquareSubscriptions(env: SitesEnv) {
  if (!env.DB || !env.SQUARE_ACCESS_TOKEN) {
    return { skipped: true, scanned: 0, updated: 0, pages: 0 };
  }

  const allowedPlanIds = new Set(
    (env.SQUARE_ALLOWED_PLAN_VARIATION_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const seenCursors = new Set<string>();
  const now = new Date().toISOString();
  let cursor: string | undefined;
  let scanned = 0;
  let updated = 0;
  let pages = 0;

  do {
    const response = await fetch(squareApiUrl(env, "/v2/subscriptions/search"), {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
        "content-type": "application/json",
        "square-version": SQUARE_VERSION,
      },
      body: JSON.stringify({
        limit: SQUARE_SEARCH_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as SquareSearchResponse;
    if (!response.ok) {
      throw new Error(body.errors?.[0]?.detail ?? `square_${response.status}`);
    }

    const subscriptions = body.subscriptions ?? [];
    scanned += subscriptions.length;
    updated += await reconcileSubscriptions(env.DB, subscriptions, allowedPlanIds, now);
    pages += 1;

    const nextCursor = typeof body.cursor === "string" && body.cursor ? body.cursor : undefined;
    if (nextCursor && seenCursors.has(nextCursor)) throw new Error("Squareのページングが循環しました");
    if (nextCursor) seenCursors.add(nextCursor);
    cursor = nextCursor;
    if (cursor && pages >= SQUARE_SEARCH_MAX_PAGES) throw new Error("Squareの全件同期がページ上限を超えました");
  } while (cursor);

  await env.DB.prepare(
    `INSERT INTO audit_logs (action, entity_type, metadata_json, created_at)
     VALUES ('square.subscriptions_scheduled_reconciled', 'member_subscription', ?, ?)`,
  ).bind(JSON.stringify({ scanned, updated, pages }), now).run();

  return { skipped: false, scanned, updated, pages };
}

export async function handleSquareSyncRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (!["/api/admin/square-sync", "/api/admin/membership-summary"].includes(pathname)) return null;

  const member = await authenticatedRequestMember(request, env);
  if (!member) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isStrictAdmin(member))
    return Response.json({ error: "管理者のみ実行できます" }, { status: 403 });
  if (!env.DB)
    return Response.json({ error: "会員DBが設定されていません" }, { status: 503 });

  if (pathname === "/api/admin/membership-summary") {
    if (request.method !== "GET")
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    const [status, missing, webhook] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) AS total,
         SUM(CASE WHEN access_status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN access_status = 'grace' THEN 1 ELSE 0 END) AS grace,
         SUM(CASE WHEN access_status = 'suspended' THEN 1 ELSE 0 END) AS suspended,
         SUM(CASE WHEN access_status = 'pending' THEN 1 ELSE 0 END) AS pending,
         MAX(last_verified_at) AS last_verified_at
         FROM member_subscriptions
         WHERE COALESCE(billing_status, '') <> 'TEST_ACCOUNT'`,
      ).first<Record<string, number | string | null>>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM members m
         WHERE m.account_status = 'active' AND m.role = 'user' AND m.access_role = 'member'
         AND COALESCE(json_extract(m.profile_json, '$.isTestAccount'), 0) <> 1
         AND NOT EXISTS (
           SELECT 1 FROM member_subscriptions s
           WHERE s.member_id = m.id OR s.billing_email = m.email
         )`,
      ).first<{ count: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS total,
         SUM(CASE WHEN processing_error IS NOT NULL THEN 1 ELSE 0 END) AS failed,
         MAX(received_at) AS last_received_at
         FROM square_webhook_events`,
      ).first<Record<string, number | string | null>>(),
    ]);
    const number = (value: unknown) => Number(value ?? 0) || 0;
    return Response.json({
      total: number(status?.total),
      active: number(status?.active),
      grace: number(status?.grace),
      suspended: number(status?.suspended),
      pending: number(status?.pending),
      missingSubscription: number(missing?.count),
      webhookEvents: number(webhook?.total),
      webhookFailures: number(webhook?.failed),
      lastVerifiedAt: typeof status?.last_verified_at === "string" ? status.last_verified_at : null,
      lastWebhookAt: typeof webhook?.last_received_at === "string" ? webhook.last_received_at : null,
    });
  }

  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (!env.SQUARE_ACCESS_TOKEN)
    return Response.json({ error: "Square連携が設定されていません" }, { status: 503 });

  try {
    const input = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedOffset = Number(input.offset ?? 0);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
      ? requestedOffset
      : 0;
    const now = new Date().toISOString();
    const allowedPlanIds = new Set(
      (env.SQUARE_ALLOWED_PLAN_VARIATION_IDS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const retrieved = await retrieveRegisteredSubscriptions(
      env.DB,
      env,
      offset,
    );
    const subscriptions = retrieved.subscriptions;
    const updated = await reconcileSubscriptions(
      env.DB,
      subscriptions,
      allowedPlanIds,
      now,
    );
    await env.DB.prepare(
      `INSERT INTO audit_logs
       (actor_user_id, action, entity_type, metadata_json, created_at)
       VALUES (?, 'square.subscriptions_reconciled', 'member_subscription', ?, ?)`,
    )
      .bind(
        String(member.id),
        JSON.stringify({
          offset,
          scanned: retrieved.scanned,
          updated,
          failed: retrieved.failed,
          total: retrieved.total,
          nextOffset: retrieved.nextOffset,
          hasMore: retrieved.hasMore,
        }),
        now,
      )
      .run();
    return Response.json({
      success: true,
      scanned: retrieved.scanned,
      updated,
      failed: retrieved.failed,
      total: retrieved.total,
      nextOffset: retrieved.nextOffset,
      hasMore: retrieved.hasMore,
    });
  } catch (error) {
    console.error("Square subscription reconciliation failed", error instanceof Error ? error.message : "unknown");
    return Response.json(
      { error: "Squareとの同期に失敗しました。時間をおいて再度お試しください。" },
      { status: 502 },
    );
  }
}
