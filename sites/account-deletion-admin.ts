import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const LIST_PATH = "/api/admin/account-deletions";
const EXPORT_PATH = "/api/admin/account-deletions/export";
const COMPLETE_PATH = /^\/api\/admin\/account-deletions\/([^/]+)\/complete$/;

type DeletionRequestRow = {
  id: string;
  member_id: number;
  status: "pending" | "cancelled" | "completed";
  source: "app" | "web";
  requested_at: string;
  scheduled_for: string;
  completed_at: string | null;
  display_name: string;
  public_member_id: string | null;
};

type SurveyExportRow = DeletionRequestRow & {
  request_type: "pause" | "withdrawal";
  survey_json: string | null;
};

type SurveyAnswers = {
  reasons?: unknown;
  comment?: unknown;
  satisfaction?: unknown;
  satisfactionReason?: unknown;
  valuedFeatures?: unknown;
  continuationCondition?: unknown;
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function strictAdmin(member: { role: string; access_role: string }) {
  return member.role === "admin" || member.access_role === "admin";
}

function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.map(String).join("、") : value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function surveyAnswers(value: string | null): SurveyAnswers {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as SurveyAnswers : {};
  } catch {
    return {};
  }
}

export function buildAccountDeletionSurveyCsv(rows: SurveyExportRow[]) {
  const header = ["申請ID", "会員ID", "表示名", "手続き", "状況", "申請元", "申請日時", "処理予定日", "休会・退会理由", "自由記述", "総合満足度", "満足度の理由", "良かったサービス", "継続・再開を検討する条件"];
  const lines = rows.map((row) => {
    const survey = surveyAnswers(row.survey_json);
    return [row.id, row.public_member_id ?? `内部ID ${row.member_id}`, row.display_name, row.request_type === "pause" ? "休会" : "退会", row.status === "pending" ? "処理待ち" : row.status === "completed" ? "完了" : "取消済み", row.source === "app" ? "アプリ" : "Web", row.requested_at, row.scheduled_for, survey.reasons, survey.comment, survey.satisfaction, survey.satisfactionReason, survey.valuedFeatures, survey.continuationCondition].map(csvCell).join(",");
  });
  return `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}`;
}

function payload(row: DeletionRequestRow) {
  return {
    id: row.id,
    memberId: row.member_id,
    publicMemberId: row.public_member_id,
    displayName: row.display_name,
    status: row.status,
    source: row.source,
    requestedAt: row.requested_at,
    scheduledFor: row.scheduled_for,
    completedAt: row.completed_at,
  };
}

export async function handleAccountDeletionAdminRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const completeMatch = COMPLETE_PATH.exec(pathname);
  if (pathname !== LIST_PATH && pathname !== EXPORT_PATH && !completeMatch) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);

  const admin = await authenticatedRequestMember(request, env);
  if (!admin) return json({ error: "ログインが必要です" }, 401);
  if (!strictAdmin(admin)) return json({ error: "管理者のみ操作できます" }, 403);

  if (pathname === EXPORT_PATH) {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const rows = await env.DB.prepare(
      `SELECT r.id, r.member_id, r.status, r.source, r.requested_at,
              r.scheduled_for, r.completed_at, r.request_type, r.survey_json,
              m.display_name, m.public_member_id
       FROM account_deletion_requests r
       JOIN members m ON m.id = r.member_id
       ORDER BY r.requested_at DESC
       LIMIT 10000`,
    ).all<SurveyExportRow>();
    return new Response(buildAccountDeletionSurveyCsv(rows.results ?? []), {
      headers: {
        "content-type": "text/csv;charset=utf-8",
        "content-disposition": `attachment; filename="iro-membership-survey-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  }

  if (pathname === LIST_PATH) {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const rows = await env.DB.prepare(
      `SELECT r.id, r.member_id, r.status, r.source, r.requested_at,
              r.scheduled_for, r.completed_at, m.display_name, m.public_member_id
       FROM account_deletion_requests r
       JOIN members m ON m.id = r.member_id
       WHERE r.request_type = 'withdrawal'
       ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
                r.requested_at DESC
       LIMIT 200`,
    ).all<DeletionRequestRow>();
    return json({ requests: (rows.results ?? []).map(payload) });
  }

  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const input = (await request.json()) as Record<string, unknown>;
  if (input.confirm !== "ANONYMIZE")
    return json({ error: "匿名化の確認が必要です" }, 400);

  const requestId = decodeURIComponent(completeMatch![1]);
  const current = await env.DB.prepare(
    `SELECT r.id, r.member_id, r.status, r.source, r.requested_at,
            r.scheduled_for, r.completed_at, m.display_name, m.public_member_id
     FROM account_deletion_requests r
     JOIN members m ON m.id = r.member_id
     WHERE r.id = ? AND r.request_type = 'withdrawal'`,
  ).bind(requestId).first<DeletionRequestRow>();
  if (!current) return json({ error: "削除申請が見つかりません" }, 404);
  if (current.status !== "pending")
    return json({ error: "この申請はすでに処理済みです" }, 409);
  if (current.member_id === admin.id)
    return json({ error: "自分自身の削除申請は別の管理者が処理してください" }, 409);

  const now = new Date().toISOString();
  const anonymousEmail = `deleted+${current.member_id}@invalid.irotas.local`;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM member_sessions WHERE member_id = ?").bind(current.member_id),
    env.DB.prepare("DELETE FROM email_verification_codes WHERE email = (SELECT email FROM members WHERE id = ?)").bind(current.member_id),
    env.DB.prepare("DELETE FROM member_private_notes WHERE owner_member_id = ? OR target_member_id = ?").bind(current.member_id, current.member_id),
    env.DB.prepare("DELETE FROM member_follows WHERE follower_member_id = ? OR followed_member_id = ?").bind(current.member_id, current.member_id),
    env.DB.prepare(
      `UPDATE member_subscriptions
       SET billing_email = 'deleted+' || member_id || '+' || id || '@invalid.irotas.local',
           access_status = 'suspended', updated_at = ?
       WHERE member_id = ?`,
    ).bind(now, current.member_id),
    env.DB.prepare(
      `UPDATE members
       SET email = ?, password_hash = NULL, display_name = '退会済みユーザー',
           discord_user_id = NULL, public_member_id = NULL,
           role = 'user', access_role = 'member', branches_json = '[]',
           account_status = 'withdrawn', member_term = NULL,
           discord_roles_json = '[]', achievement_badges_json = '[]',
           profile_json = '{}', xp = 0, last_signed_in_at = NULL, updated_at = ?
       WHERE id = ?`,
    ).bind(anonymousEmail, now, current.member_id),
    env.DB.prepare(
      `UPDATE account_deletion_requests
       SET status = 'completed', completed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    ).bind(now, now, requestId),
    env.DB.prepare(
      `INSERT INTO audit_logs
       (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
       VALUES (?, 'admin.account_deletion_completed', 'account_deletion', ?, ?, ?)`,
    ).bind(admin.id, requestId, JSON.stringify({ memberId: current.member_id }), now),
  ]);

  return json({ success: true, request: payload({ ...current, status: "completed", completed_at: now, display_name: "退会済みユーザー", public_member_id: null }) });
}
