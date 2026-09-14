import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const ELIGIBLE_MEMBERS = `m.account_status = 'active'
  AND COALESCE(json_extract(m.profile_json, '$.isTestAccount'), 0) != 1
  AND (m.access_role IN ('club_leader', 'operator', 'admin')
    OR EXISTS (SELECT 1 FROM member_subscriptions s
      WHERE s.member_id = m.id AND s.access_status IN ('active', 'grace')))`;

type CountRow = { key: string; count: number };

/** Aggregate in SQLite so large member directories are not truncated by D1's row limit. */
export async function handleAnalyticsRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/api/admin/analytics") return null;
  if (request.method !== "GET") return Response.json({ error: "Method Not Allowed" }, { status: 405 });
  if (!env.DB) return Response.json({ error: "データベースに接続できません" }, { status: 503 });
  const member = await authenticatedRequestMember(request, env);
  if (!member) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  if (member.role !== "admin" && member.access_role !== "admin")
    return Response.json({ error: "管理者権限が必要です" }, { status: 403 });

  const queries = [
    `SELECT 'total' AS key, COUNT(*) AS count FROM members m WHERE ${ELIGIBLE_MEMBERS}`,
    `SELECT COALESCE(NULLIF(json_extract(m.profile_json, '$.gender'), ''), 'unset') AS key,
      COUNT(*) AS count FROM members m WHERE ${ELIGIBLE_MEMBERS} GROUP BY key`,
    `SELECT CASE
        WHEN lower(COALESCE(m.discord_roles_json, '')) LIKE '%platinum%' OR COALESCE(m.discord_roles_json, '') LIKE '%プラチナ%' THEN 'platinum'
        WHEN lower(COALESCE(m.discord_roles_json, '')) LIKE '%gold%' OR COALESCE(m.discord_roles_json, '') LIKE '%ゴールド%' THEN 'gold'
        WHEN lower(COALESCE(m.discord_roles_json, '')) LIKE '%silver%' OR COALESCE(m.discord_roles_json, '') LIKE '%シルバー%' THEN 'silver'
        WHEN m.member_rank IN ('regular', 'silver', 'gold', 'platinum') THEN m.member_rank
        ELSE 'regular' END AS key, COUNT(*) AS count
      FROM members m WHERE ${ELIGIBLE_MEMBERS} GROUP BY key`,
    `SELECT j.value AS key, COUNT(DISTINCT m.id) AS count FROM members m,
      json_each(CASE WHEN json_valid(m.branches_json) THEN m.branches_json ELSE '[]' END) j
      WHERE ${ELIGIBLE_MEMBERS} AND j.value IN ('kanto', 'kansai') GROUP BY j.value`,
    `SELECT substr(COALESCE(
        (SELECT MIN(s.subscription_started_at) FROM member_subscriptions s WHERE s.member_id = m.id),
        m.discord_joined_at, m.created_at), 1, 7) AS key, COUNT(*) AS count
      FROM members m WHERE ${ELIGIBLE_MEMBERS} GROUP BY key`,
  ];
  const results = await Promise.all(queries.map((sql) => env.DB!.prepare(sql).all<CountRow>()));
  const counts = (index: number) => Object.fromEntries((results[index].results ?? []).map((row) => [row.key, Number(row.count)]));
  const response = {
    totalMembers: counts(0).total ?? 0,
    genderCounts: counts(1),
    rankCounts: counts(2),
    branchCounts: counts(3),
    monthlyJoins: counts(4),
  };
  return Response.json(response, { headers: { "cache-control": "private, no-store" } });
}
