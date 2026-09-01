import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const ENDPOINT = "/api/admin/discord-profile-import/commit";
type Rank = "regular" | "silver" | "gold" | "platinum";
type ImportRow = { discordUserId: string; displayName: string; avatarUrl: string; bio: string; hasProfileBio: boolean; discordJoinedAt: string | null; discordRoles: string[]; memberTerm: string | null; memberRank: Rank };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export function validateDiscordProfileImport(body: unknown): ImportRow[] {
  if (!body || typeof body !== "object") throw new Error("invalid_body");
  const source = body as { confirmation?: unknown; rows?: unknown };
  if (!Array.isArray(source.rows) || source.rows.length < 1 || source.rows.length > 2_000) throw new Error("invalid_rows");
  if (source.confirmation !== `IMPORT_DISCORD_PROFILES_${source.rows.length}`) throw new Error("confirmation_required");
  const seen = new Set<string>();
  return source.rows.map((value, index) => {
    if (!value || typeof value !== "object") throw new Error(`invalid_row:${index}`);
    const row = value as Record<string, unknown>;
    const discordUserId = String(row.discordUserId ?? "").trim();
    if (!/^\d{17,20}$/.test(discordUserId) || seen.has(discordUserId)) throw new Error(`invalid_discord_id:${index}`);
    seen.add(discordUserId);
    const memberRank = String(row.memberRank ?? "regular") as Rank;
    if (!["regular", "silver", "gold", "platinum"].includes(memberRank)) throw new Error(`invalid_rank:${index}`);
    const avatar = typeof row.avatarUrl === "string" ? row.avatarUrl.trim() : "";
    const avatarUrl = /^https:\/\/(?:cdn\.|media\.)?discord(?:app)?\.(?:com|net)\//i.test(avatar) ? avatar.slice(0, 2000) : "";
    const discordJoinedAt = typeof row.discordJoinedAt === "string" && !Number.isNaN(Date.parse(row.discordJoinedAt)) ? row.discordJoinedAt : null;
    const rawTerm = typeof row.memberTerm === "string" ? row.memberTerm.trim() : "";
    return {
      discordUserId,
      displayName: typeof row.displayName === "string" ? row.displayName.trim().slice(0, 120) : "",
      avatarUrl,
      bio: typeof row.bio === "string" ? row.bio.trim().slice(0, 4000) : "",
      hasProfileBio: row.hasProfileBio === true,
      discordJoinedAt,
      discordRoles: Array.isArray(row.discordRoles) ? row.discordRoles.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 120)).slice(0, 150) : [],
      memberTerm: /^第?\d+期$/.test(rawTerm) ? rawTerm.replace(/^(?!第)/, "第") : null,
      memberRank,
    };
  });
}

export async function handleDiscordProfileImportRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== ENDPOINT) return null;
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const admin = await authenticatedRequestMember(request, env);
  if (!admin) return json({ error: "ログインが必要です" }, 401);
  if (admin.role !== "admin" && admin.access_role !== "admin") return json({ error: "管理者権限が必要です" }, 403);
  try {
    const rows = validateDiscordProfileImport(await request.json());
    const existing = await env.DB.prepare("SELECT id, discord_user_id FROM members WHERE discord_user_id IS NOT NULL").all<{ id: number; discord_user_id: string }>();
    const ids = new Map((existing.results ?? []).map((member) => [member.discord_user_id, member.id]));
    const matched = rows.filter((row) => ids.has(row.discordUserId));
    const now = new Date().toISOString();
    const statements = matched.map((row) => env.DB!.prepare(`UPDATE members SET
      display_name = CASE WHEN ? != '' THEN ? ELSE display_name END,
      member_term = COALESCE(?, member_term), member_rank = ?, discord_roles_json = ?, discord_joined_at = COALESCE(?, discord_joined_at),
      profile_json = json_set(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END,
        '$.bio', CASE WHEN ? THEN ? ELSE COALESCE(json_extract(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END, '$.bio'), '') END,
        '$.avatarUrl', CASE WHEN ? != '' THEN ? ELSE COALESCE(json_extract(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END, '$.avatarUrl'), '') END),
      updated_at = ? WHERE id = ?`).bind(row.displayName, row.displayName, row.memberTerm, row.memberRank, JSON.stringify(row.discordRoles), row.discordJoinedAt, row.hasProfileBio ? 1 : 0, row.bio, row.avatarUrl, row.avatarUrl, now, ids.get(row.discordUserId)));
    for (let index = 0; index < statements.length; index += 50) {
      await env.DB.batch(statements.slice(index, index + 50));
    }
    await env.DB.prepare(`INSERT INTO club_memberships (club_id, member_id, status, source, applied_at, approved_at, updated_at)
      SELECT c.id, m.id, 'approved', 'discord', ?, ?, ? FROM clubs c JOIN members m CROSS JOIN json_each(CASE WHEN json_valid(m.discord_roles_json) THEN m.discord_roles_json ELSE '[]' END) r
      WHERE CAST(r.value AS TEXT) LIKE '%' || c.name || '%' ON CONFLICT(club_id, member_id) DO UPDATE SET status = 'approved', source = 'discord', updated_at = excluded.updated_at`).bind(now, now, now).run();
    const runId = `discord-profile-${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO migration_runs (id, migration_type, source_filename, status, imported_count, skipped_count, error_count, summary_json, started_at, completed_at)
      VALUES (?, 'discord_profiles', 'discord-live-2026-08-30', 'completed', ?, ?, 0, ?, ?, ?)`).bind(runId, matched.length, rows.length - matched.length, JSON.stringify({ requestedCount: rows.length, matchedCount: matched.length }), now, now).run();
    return json({ success: true, runId, requestedCount: rows.length, matchedCount: matched.length, unmatchedCount: rows.length - matched.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message.split(":")[0] : "invalid_request" }, 400);
  }
}
