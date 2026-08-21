import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

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
  errors?: Array<{ detail?: string }>;
};

const SQUARE_VERSION = "2026-07-15";
export const SQUARE_SYNC_BATCH_SIZE = 40;
const VALID_STATUSES = new Set([
  "PENDING",
  "ACTIVE",
  "CANCELED",
  "DEACTIVATED",
  "PAUSED",
  "COMPLETED",
]);

export function isStrictAdmin(member: {
  role: string;
  access_role: string;
} | null) {
  return Boolean(
    member && (member.role === "admin" || member.access_role === "admin"),
  );
}

function addDays(date: string, days: number) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function subscriptionAccessState(
  subscription: SquareSubscription,
  allowedPlanIds: Set<string>,
  today = new Date().toISOString().slice(0, 10),
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
  if (paidUntil && paidUntil < today) {
    const graceUntil = addDays(paidUntil, 7);
    return {
      status,
      accessStatus: graceUntil >= today ? "grace" : "suspended",
      paidUntil,
      graceUntil,
    };
  }
  return { status, accessStatus: "active", paidUntil, graceUntil: null };
}

async function retrieveRegisteredSubscriptions(
  db: D1Database,
  accessToken: string,
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
          `https://connect.squareup.com/v2/subscriptions/${encodeURIComponent(id)}`,
          {
            headers: {
              authorization: `Bearer ${accessToken}`,
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
    const state = subscriptionAccessState(subscription, allowedPlanIds, now.slice(0, 10));
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
      env.SQUARE_ACCESS_TOKEN,
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
