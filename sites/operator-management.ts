import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const OPERATORS_ENDPOINT = "/api/admin/operators";
const OPERATOR_TERM_PATH = /^\/api\/admin\/operators\/(\d+)\/member-term$/;

type OperatorRow = {
  id: number;
  public_member_id: string | null;
  display_name: string;
  member_term: string | null;
};

export function isStrictAdmin(member: {
  role: string;
  access_role: string;
}) {
  return member.role === "admin" || member.access_role === "admin";
}

export function normalizeMemberTerm(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const match = /^第([1-9]\d?)期$/.exec(value.trim());
  return match ? `第${Number(match[1])}期` : undefined;
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function operatorPayload(row: OperatorRow) {
  return {
    userId: row.id,
    memberId: row.public_member_id,
    displayName: row.display_name,
    memberTerm: row.member_term,
  };
}

export async function handleOperatorManagementRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const termMatch = OPERATOR_TERM_PATH.exec(pathname);
  if (pathname !== OPERATORS_ENDPOINT && !termMatch) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);

  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer) return json({ error: "ログインが必要です" }, 401);
  if (!isStrictAdmin(viewer)) return json({ error: "管理者のみ操作できます" }, 403);

  if (pathname === OPERATORS_ENDPOINT) {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const rows = await env.DB.prepare(
      `SELECT id, public_member_id, display_name, member_term
       FROM members
       WHERE account_status = 'active'
         AND (access_role = 'operator' OR role = 'operator')
         AND access_role <> 'admin' AND role <> 'admin'
       ORDER BY display_name COLLATE NOCASE, id`,
    ).all<OperatorRow>();
    return json({ operators: (rows.results ?? []).map(operatorPayload) });
  }

  if (request.method !== "PATCH") return json({ error: "method_not_allowed" }, 405);
  const input = (await request.json()) as Record<string, unknown>;
  const memberTerm = normalizeMemberTerm(input.memberTerm);
  if (memberTerm === undefined)
    return json({ error: "期は1〜99の数字で指定してください" }, 400);

  const operatorId = Number(termMatch![1]);
  const current = await env.DB.prepare(
    `SELECT id, public_member_id, display_name, member_term
     FROM members
     WHERE id = ? AND account_status = 'active'
       AND (access_role = 'operator' OR role = 'operator')
       AND access_role <> 'admin' AND role <> 'admin'`,
  ).bind(operatorId).first<OperatorRow>();
  if (!current) return json({ error: "運営メンバーが見つかりません" }, 404);

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE members SET member_term = ?, updated_at = ?
       WHERE id = ? AND (access_role = 'operator' OR role = 'operator')
         AND access_role <> 'admin' AND role <> 'admin'`,
    ).bind(memberTerm, now, operatorId),
    env.DB.prepare(
      `INSERT INTO audit_logs
       (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
       VALUES (?, 'operator.member_term_updated', 'member', ?, ?, ?)`,
    ).bind(
      viewer.id,
      String(operatorId),
      JSON.stringify({ before: current.member_term, after: memberTerm }),
      now,
    ),
  ]);

  return json({
    operator: operatorPayload({ ...current, member_term: memberTerm }),
  });
}
