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

type SquareSearchResponse = {
  subscriptions?: SquareSubscription[];
  cursor?: string;
  errors?: Array<{ detail?: string }>;
};

const SQUARE_VERSION = "2026-07-15";
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

async function searchSubscriptions(
  accessToken: string,
): Promise<SquareSubscription[]> {
  const subscriptions: SquareSubscription[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const response = await fetch(
      "https://connect.squareup.com/v2/subscriptions/search",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "square-version": SQUARE_VERSION,
        },
        body: JSON.stringify(cursor ? { cursor } : {}),
      },
    );
    const result = (await response.json().catch(() => ({}))) as SquareSearchResponse;
    if (!response.ok) {
      throw new Error(result.errors?.[0]?.detail ?? `square_${response.status}`);
    }
    subscriptions.push(...(result.subscriptions ?? []));
    cursor = result.cursor;
    if (!cursor) break;
  }
  return subscriptions;
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
               square_status = ?, access_status = ?, paid_until_date = ?,
               grace_until_date = ?, subscription_started_at = COALESCE(subscription_started_at, ?),
               last_verified_at = ?, updated_at = ?
           WHERE square_subscription_id = ?`,
        )
        .bind(
          subscription.customer_id ?? "",
          subscription.plan_variation_id ?? "",
          state.status,
          state.accessStatus,
          state.paidUntil,
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
  if (pathname !== "/api/admin/square-sync") return null;
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 });

  const member = await authenticatedRequestMember(request, env);
  if (!member) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isStrictAdmin(member))
    return Response.json({ error: "管理者のみ実行できます" }, { status: 403 });
  if (!env.DB || !env.SQUARE_ACCESS_TOKEN)
    return Response.json({ error: "Square連携が設定されていません" }, { status: 503 });

  try {
    const now = new Date().toISOString();
    const allowedPlanIds = new Set(
      (env.SQUARE_ALLOWED_PLAN_VARIATION_IDS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const subscriptions = await searchSubscriptions(env.SQUARE_ACCESS_TOKEN);
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
        JSON.stringify({ scanned: subscriptions.length, updated }),
        now,
      )
      .run();
    return Response.json({ success: true, scanned: subscriptions.length, updated });
  } catch (error) {
    console.error("Square subscription reconciliation failed", error instanceof Error ? error.message : "unknown");
    return Response.json(
      { error: "Squareとの同期に失敗しました。時間をおいて再度お試しください。" },
      { status: 502 },
    );
  }
}
