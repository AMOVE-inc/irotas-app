import { authenticatedRequestMember, hashPassword } from "./auth";
import type { SitesEnv } from "./platform-types";

const ENDPOINT = "/api/admin/review-account";

type ReviewAccountRow = {
  id: number;
  email: string;
  display_name: string;
  account_status: "active" | "suspended" | "withdrawn";
  profile_json: string;
  updated_at: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function isAdmin(member: { role: string; access_role: string }) {
  return member.role === "admin" || member.access_role === "admin";
}

function isReviewProfile(value: string) {
  try {
    const profile = JSON.parse(value) as Record<string, unknown>;
    return profile.isReviewAccount === true;
  } catch {
    return false;
  }
}

function payload(row: ReviewAccountRow | null) {
  return row
    ? {
        configured: true,
        email: row.email,
        displayName: row.display_name,
        active: row.account_status === "active",
        updatedAt: row.updated_at,
      }
    : { configured: false, email: null, displayName: null, active: false, updatedAt: null };
}

export async function handleReviewAccountRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== ENDPOINT) return null;
  if (!env.DB || !env.AUTH_SECRET)
    return json({ error: "認証基盤に接続できません" }, 503);
  const admin = await authenticatedRequestMember(request, env);
  if (!admin) return json({ error: "ログインが必要です" }, 401);
  if (!isAdmin(admin)) return json({ error: "管理者のみ操作できます" }, 403);

  const current = await env.DB.prepare(
    `SELECT id, email, display_name, account_status, profile_json, updated_at
     FROM members
     WHERE COALESCE(json_extract(profile_json, '$.isReviewAccount'), 0) = 1
     ORDER BY updated_at DESC LIMIT 1`,
  ).first<ReviewAccountRow>();

  if (request.method === "GET") return json({ account: payload(current) });

  if (request.method === "DELETE") {
    if (!current) return json({ error: "審査アカウントは未設定です" }, 404);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM member_sessions WHERE member_id = ?").bind(current.id),
      env.DB.prepare("UPDATE members SET account_status = 'suspended', updated_at = ? WHERE id = ?").bind(now, current.id),
      env.DB.prepare("UPDATE member_subscriptions SET access_status = 'suspended', updated_at = ? WHERE member_id = ?").bind(now, current.id),
      env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, 'admin.review_account_suspended', 'member', ?, NULL, ?)`).bind(admin.id, String(current.id), now),
    ]);
    return json({ account: payload({ ...current, account_status: "suspended", updated_at: now }) });
  }

  if (request.method !== "PUT") return json({ error: "method_not_allowed" }, 405);
  const input = (await request.json()) as Record<string, unknown>;
  const email = String(input.email ?? "").trim().toLowerCase();
  const displayName = String(input.displayName ?? "App Review Member").trim().slice(0, 80);
  const password = String(input.password ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)
    return json({ error: "有効な審査用メールアドレスを入力してください" }, 400);
  if (password.length < 12 || password.length > 128)
    return json({ error: "一時パスワードは12〜128文字で設定してください" }, 400);
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    return json({ error: "一時パスワードには英字と数字を含めてください" }, 400);

  const collision = await env.DB.prepare(
    "SELECT id, email, display_name, account_status, profile_json, updated_at FROM members WHERE email = ?",
  ).bind(email).first<ReviewAccountRow>();
  if (collision && !isReviewProfile(collision.profile_json))
    return json({ error: "このメールアドレスは通常会員が使用しています" }, 409);
  if (current && collision && current.id !== collision.id)
    return json({ error: "別の審査アカウントで使用中のメールアドレスです" }, 409);

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password, undefined, env.AUTH_SECRET);
  let memberId = collision?.id ?? current?.id ?? null;
  if (memberId) {
    await env.DB.prepare(
      `UPDATE members SET email = ?, display_name = ?, password_hash = ?,
       role = 'user', access_role = 'member', account_status = 'active',
       member_rank = 'regular', branches_json = '["kanto"]',
       profile_json = '{"isTestAccount":true,"isReviewAccount":true}', updated_at = ?
       WHERE id = ?`,
    ).bind(email, displayName || "App Review Member", passwordHash, now, memberId).run();
  } else {
    const inserted = await env.DB.prepare(
      `INSERT INTO members
       (email, password_hash, display_name, public_member_id, role, access_role,
        branches_json, account_status, member_rank, profile_json, password_set_at, created_at, updated_at)
       VALUES (?, ?, ?, 'IRO-REVIEW-001', 'user', 'member', '["kanto"]', 'active',
               'regular', '{"isTestAccount":true,"isReviewAccount":true}', ?, ?, ?)
       RETURNING id`,
    ).bind(email, passwordHash, displayName || "App Review Member", now, now, now).first<{ id: number }>();
    memberId = inserted?.id ?? null;
  }
  if (!memberId) return json({ error: "審査アカウントを作成できませんでした" }, 500);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM member_sessions WHERE member_id = ?").bind(memberId),
    env.DB.prepare("DELETE FROM member_subscriptions WHERE member_id = ? AND billing_status = 'REVIEW_ACCOUNT'").bind(memberId),
    env.DB.prepare(
      `INSERT INTO member_subscriptions
       (member_id, billing_email, square_status, billing_status, access_status,
        subscription_started_at, last_verified_at, created_at, updated_at)
       VALUES (?, ?, 'ACTIVE', 'REVIEW_ACCOUNT', 'active', ?, ?, ?, ?)
       ON CONFLICT(billing_email) DO UPDATE SET member_id = excluded.member_id,
         square_customer_id = NULL, square_subscription_id = NULL, plan_variation_id = NULL,
         square_status = 'ACTIVE', billing_status = 'REVIEW_ACCOUNT', access_status = 'active',
         last_verified_at = excluded.last_verified_at, updated_at = excluded.updated_at`,
    ).bind(memberId, email, now, now, now, now),
    env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (?, 'admin.review_account_configured', 'member', ?, ?, ?)`).bind(
      admin.id,
      String(memberId),
      JSON.stringify({ accessRole: "member", squareProductionRecord: false }),
      now,
    ),
  ]);
  return json({ account: { configured: true, email, displayName: displayName || "App Review Member", active: true, updatedAt: now } });
}
