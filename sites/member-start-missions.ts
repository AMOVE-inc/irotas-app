import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";
import { rankFromXp } from "./xp";

const PATH = "/api/member/start-missions";
const BONUS_XP = 10;

export type StartMissionKey = "profile" | "introduction" | "event_application" | "club_membership" | "meal_report" | "event_creation";
export type StartMissionProgress = { key: StartMissionKey; completed: boolean };

export function startMissionStepsFromRow(row: Record<string, unknown>): StartMissionProgress[] {
  return [
    { key: "profile", completed: Number(row.profile_complete) === 1 },
    { key: "introduction", completed: Number(row.introduction_complete) === 1 },
    { key: "event_application", completed: Number(row.event_application_complete) === 1 },
    { key: "club_membership", completed: Number(row.club_membership_complete) === 1 },
    { key: "meal_report", completed: Number(row.meal_report_complete) === 1 },
    { key: "event_creation", completed: Number(row.event_creation_complete) === 1 },
  ];
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
}

export async function handleMemberStartMissionRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== PATH) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO member_start_mission_state
    (member_id, created_at, updated_at) VALUES (?, ?, ?)`).bind(member.id, now, now).run();

  if (request.method === "POST") {
    const body = await request.json().catch(() => null) as { action?: unknown } | null;
    if (body?.action !== "mark_seen") return json({ error: "操作が不正です" }, 400);
    await env.DB.prepare("UPDATE member_start_mission_state SET guide_seen_at = COALESCE(guide_seen_at, ?), updated_at = ? WHERE member_id = ?")
      .bind(now, now, member.id).run();
    return json({ success: true });
  }
  if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405);

  const row = await env.DB.prepare(`SELECT m.xp, m.member_rank,
      CASE WHEN TRIM(COALESCE(m.display_name,'')) <> '' AND TRIM(COALESCE(m.user_handle,'')) <> ''
        AND TRIM(COALESCE(json_extract(m.profile_json,'$.birthDate'),'')) <> ''
        AND COALESCE(json_extract(m.profile_json,'$.gender'),'unset') IN ('male','female','other') THEN 1 ELSE 0 END AS profile_complete,
      EXISTS(SELECT 1 FROM board_threads bt WHERE bt.author_member_id = m.id AND bt.category = 'introduction' AND bt.deleted_at IS NULL) AS introduction_complete,
      EXISTS(SELECT 1 FROM event_participations ep WHERE ep.member_id = m.id AND ep.status IN ('applied','confirmed','cancel_requested','cancelled')) AS event_application_complete,
      EXISTS(SELECT 1 FROM club_memberships cm WHERE cm.member_id = m.id AND cm.status = 'approved') AS club_membership_complete,
      EXISTS(SELECT 1 FROM board_threads bt WHERE bt.author_member_id = m.id AND bt.category IN ('meal-report','gourmet-report') AND bt.deleted_at IS NULL) AS meal_report_complete,
      EXISTS(SELECT 1 FROM events e WHERE e.organizer_member_id = m.id) AS event_creation_complete,
      s.guide_seen_at
    FROM members m JOIN member_start_mission_state s ON s.member_id = m.id WHERE m.id = ? LIMIT 1`)
    .bind(member.id).first<Record<string, unknown>>();
  if (!row) return json({ error: "会員情報が見つかりません" }, 404);
  const steps = startMissionStepsFromRow(row);
  const allCompleted = steps.every((step) => step.completed);
  const grantId = `start_missions:${member.id}:${crypto.randomUUID()}`;
  const completedKeys = steps.filter((step) => step.completed).map((step) => step.key);
  if (completedKeys.length > 0) {
    const pendingCountSql = `(SELECT COUNT(*) FROM member_start_mission_rewards WHERE member_id = ? AND grant_id = ? AND status = 'pending')`;
    await env.DB.batch([
      ...completedKeys.map((key) => env.DB!.prepare(`INSERT OR IGNORE INTO member_start_mission_rewards
        (member_id, mission_key, grant_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)`)
        .bind(member.id, key, grantId, now)),
      env.DB.prepare(`UPDATE members SET
        xp = COALESCE(xp, 0) + (${BONUS_XP} * ${pendingCountSql}),
        member_rank = CASE
          WHEN COALESCE(xp, 0) + (${BONUS_XP} * ${pendingCountSql}) >= 12000 THEN 'platinum'
          WHEN COALESCE(xp, 0) + (${BONUS_XP} * ${pendingCountSql}) >= 5500 THEN 'gold'
          WHEN COALESCE(xp, 0) + (${BONUS_XP} * ${pendingCountSql}) >= 1500 THEN 'silver'
          ELSE 'regular' END,
        updated_at = ? WHERE id = ?`)
        .bind(member.id, grantId, member.id, grantId, member.id, grantId, member.id, grantId, now, member.id),
      env.DB.prepare(`UPDATE member_start_mission_rewards SET status = 'applied', awarded_at = ?
        WHERE member_id = ? AND grant_id = ? AND status = 'pending'`).bind(now, member.id, grantId),
    ]);
  }
  const granted = await env.DB.prepare(`SELECT mission_key FROM member_start_mission_rewards
    WHERE member_id = ? AND grant_id = ? AND status = 'applied' ORDER BY mission_key`)
    .bind(member.id, grantId).all<{ mission_key: StartMissionKey }>();
  const awardedKeys = (granted.results ?? []).map((item) => item.mission_key);
  const awardedAmount = awardedKeys.length * BONUS_XP;
  const after = await env.DB.prepare("SELECT xp FROM members WHERE id = ? LIMIT 1")
    .bind(member.id).first<{ xp: number }>();
  const nextXp = Math.max(0, Number(after?.xp ?? row.xp ?? 0));
  const previousXp = Math.max(0, nextXp - awardedAmount);
  const previousRank = rankFromXp(previousXp);
  const nextRank = rankFromXp(nextXp);
  const bonusAwardedNow = awardedAmount > 0;
  if (bonusAwardedNow) await env.DB.prepare(`INSERT INTO audit_logs
    (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
    VALUES (?, 'member.start_mission_rewards_applied', 'member', ?, ?, ?)`).bind(
      String(member.id), String(member.id), JSON.stringify({ xp: awardedAmount, missions: awardedKeys }), now,
    ).run();
  return json({
    guideSeen: Boolean(row.guide_seen_at), steps, completedCount: steps.filter((step) => step.completed).length,
    totalCount: steps.length, allCompleted, bonusAwardedNow,
    reward: bonusAwardedNow ? { amount: awardedAmount, reason: `${awardedKeys.length}件のスタートミッション初回達成`, previousXp, nextXp, previousRank, nextRank } : null,
  });
}
