import { authenticatedRequestMember } from "./auth";
import { levelFromXp, minimumXpForRank, rankFromLevel, totalXpForLevel } from "../lib/xp-levels";
import type { SitesEnv } from "./platform-types";
import { MEE6_IDENTIFIED_LEVELS } from "./mee6-snapshot";
import { MEE6_VERIFIED_CSV_LEVELS } from "./mee6-csv-matches";

const PATH = "/api/admin/mee6-levels";
const IMPORT_PATH = `${PATH}/import`;
const SNAPSHOT_PATH = `${PATH}/import-identified-snapshot`;
const SNAPSHOT_LEVELS = Object.fromEntries(Object.keys({ ...MEE6_IDENTIFIED_LEVELS, ...MEE6_VERIFIED_CSV_LEVELS })
  .map((level) => [level, [...(MEE6_IDENTIFIED_LEVELS[level] ?? []), ...(MEE6_VERIFIED_CSV_LEVELS[level] ?? [])]]));
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" },
});

type MemberRow = {
  id: number; public_member_id: string | null; display_name: string; discord_user_id: string | null;
  xp: number | null; member_rank: string | null; mee6_level: number | null; mee6_imported_at: string | null;
};

export async function handleMee6LevelsRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== PATH && pathname !== IMPORT_PATH && pathname !== SNAPSHOT_PATH) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer || (viewer.role !== "admin" && viewer.access_role !== "admin"))
    return json({ error: "管理者権限が必要です" }, 403);

  if (pathname === PATH && request.method === "GET") {
    const result = await env.DB.prepare(`SELECT id, public_member_id, display_name, discord_user_id, xp, member_rank,
      mee6_level, mee6_imported_at FROM members WHERE account_status = 'active'
      AND COALESCE(json_extract(profile_json, '$.isTestAccount'), 0) <> 1
      ORDER BY COALESCE(mee6_level, -1) DESC, COALESCE(xp, 0) DESC, id`).all<MemberRow>();
    const members = (result.results ?? []).map((row) => ({
      memberId: row.public_member_id ?? `member-${row.id}`,
      displayName: row.display_name,
      discordLinked: Boolean(row.discord_user_id),
      mee6Level: row.mee6_level,
      currentLevel: levelFromXp(Math.max(0, Number(row.xp ?? 0))),
      importedAt: row.mee6_imported_at,
    }));
    return json({ members, importedCount: members.filter((member) => member.mee6Level !== null).length });
  }

  if ((pathname === IMPORT_PATH || pathname === SNAPSHOT_PATH) && request.method === "POST") {
    const raw = pathname === SNAPSHOT_PATH ? JSON.stringify({
      levels: SNAPSHOT_LEVELS,
      confirmation: `IMPORT_MEE6_LEVELS_${Object.values(SNAPSHOT_LEVELS).reduce((count, ids) => count + ids.length, 0)}`,
    }) : await request.text();
    if (new TextEncoder().encode(raw).byteLength > 128_000) return json({ error: "データが大きすぎます" }, 413);
    let payload: { confirmation?: unknown; rows?: unknown; levels?: Record<string, unknown> };
    try { payload = JSON.parse(raw) as typeof payload; } catch { return json({ error: "JSON形式を確認してください" }, 400); }
    if (!Array.isArray(payload.rows) && payload.levels && typeof payload.levels === "object") {
      payload.rows = Object.entries(payload.levels).flatMap(([level, ids]) => Array.isArray(ids)
        ? ids.map((discordUserId) => ({ discordUserId, level: Number(level) })) : []);
    }
    if (!Array.isArray(payload.rows) || payload.rows.length < 1 || payload.rows.length > 2_000 ||
      payload.confirmation !== `IMPORT_MEE6_LEVELS_${payload.rows.length}`)
      return json({ error: "件数と確認コードを確認してください" }, 400);
    const seen = new Set<string>();
    const rows: { discordUserId: string; level: number }[] = [];
    for (const value of payload.rows) {
      const item = value as { discordUserId?: unknown; level?: unknown } | null;
      const discordUserId = String(item?.discordUserId ?? "");
      const level = item?.level;
      if (!/^\d{17,20}$/.test(discordUserId) || seen.has(discordUserId) ||
          typeof level !== "number" || !Number.isInteger(level) || level < 0 || level > 500)
        return json({ error: `不正または重複した行があります（${rows.length + 1}行目）` }, 400);
      seen.add(discordUserId);
      rows.push({ discordUserId, level });
    }
    const members = await env.DB.prepare(`SELECT id, discord_user_id, xp, member_rank FROM members
      WHERE account_status = 'active' AND discord_user_id IS NOT NULL`).all<{
      id: number; discord_user_id: string; xp: number | null; member_rank: string | null;
    }>();
    const byDiscordId = new Map((members.results ?? []).map((member) => [member.discord_user_id, member]));
    const now = new Date().toISOString();
    const statements = rows.flatMap(({ discordUserId, level }) => {
      const member = byDiscordId.get(discordUserId);
      if (!member) return [];
      const floor = minimumXpForRank(member.member_rank);
      const xp = Math.max(Number(member.xp ?? 0), floor, totalXpForLevel(level));
      const rank = rankFromLevel(levelFromXp(xp));
      return [env.DB!.prepare(`UPDATE members SET xp = ?, mee6_level = ?, mee6_imported_at = ?,
        member_rank = ?, updated_at = ? WHERE id = ?`)
        .bind(xp, level, now, minimumXpForRank(rank) >= floor ? rank : member.member_rank, now, member.id)];
    });
    for (let i = 0; i < statements.length; i += 60) await env.DB.batch(statements.slice(i, i + 60));
    const unmatched = rows.filter((row) => !byDiscordId.has(row.discordUserId)).map((row) => row.discordUserId);
    await env.DB.prepare(`INSERT INTO migration_runs (id, migration_type, source_filename, status,
      imported_count, skipped_count, error_count, summary_json, started_at, completed_at)
      VALUES (?, 'mee6_levels', 'mee6-leaderboard-2026-09-13', 'completed', ?, ?, 0, ?, ?, ?)`)
      .bind(`mee6-levels-${crypto.randomUUID()}`, statements.length, unmatched.length,
        JSON.stringify({ sourceRows: rows.length, unmatchedDiscordIds: unmatched }), now, now).run();
    return json({ importedCount: statements.length, unmatchedDiscordIds: unmatched, sourceRows: rows.length });
  }
  return json({ error: "method_not_allowed" }, 405);
}
