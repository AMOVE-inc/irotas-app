import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const PATH = /^\/api\/admin\/discord-club-import\/(preview|commit)$/;
const MAX_BYTES = 160 * 1024;
const MAX_ROWS = 1500;

type SourceRow = { discordUserId: string; clubIds: string[] };
type Membership = { member_id: number; club_id: string; status: string };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

export function validateDiscordClubImport(input: unknown): SourceRow[] {
  if (!input || typeof input !== "object") throw new Error("invalid_body");
  const value = input as { rows?: unknown; confirmation?: unknown };
  if (!Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > MAX_ROWS) throw new Error("invalid_rows");
  if (value.confirmation !== `IMPORT_DISCORD_CLUBS_${value.rows.length}`) throw new Error("confirmation_required");
  const ids = new Set<string>();
  return value.rows.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`invalid_row:${index}`);
    const row = raw as Record<string, unknown>;
    const discordUserId = row.discordUserId;
    if (typeof discordUserId !== "string" || !/^\d{17,20}$/.test(discordUserId) || ids.has(discordUserId)) throw new Error(`invalid_discord_id:${index}`);
    ids.add(discordUserId);
    if (!Array.isArray(row.clubIds) || row.clubIds.length < 1 || row.clubIds.length > 20 ||
      row.clubIds.some((id) => typeof id !== "string" || !/^club-[a-z0-9-]+$/.test(id)) ||
      new Set(row.clubIds).size !== row.clubIds.length) throw new Error(`invalid_club_ids:${index}`);
    return { discordUserId, clubIds: row.clubIds as string[] };
  });
}

export async function handleDiscordClubImportRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const match = PATH.exec(new URL(request.url).pathname);
  if (!match) return null;
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.DB) return json({ error: "database_unavailable" }, 503);
  const actor = await authenticatedRequestMember(request, env);
  if (!actor) return json({ error: "authentication_required" }, 401);
  if (actor.role !== "admin" && actor.access_role !== "admin") return json({ error: "admin_required" }, 403);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return json({ error: "too_large" }, 413);
  try {
    const rows = validateDiscordClubImport(JSON.parse(raw) as unknown);
    const [clubResult, memberResult, membershipResult] = await Promise.all([
      env.DB.prepare("SELECT id FROM clubs WHERE status = 'active'").all<{ id: string }>(),
      env.DB.prepare("SELECT id, discord_user_id, account_status FROM members WHERE discord_user_id IS NOT NULL").all<{ id: number; discord_user_id: string; account_status: string }>(),
      env.DB.prepare("SELECT member_id, club_id, status FROM club_memberships").all<Membership>(),
    ]);
    const activeClubs = new Set((clubResult.results ?? []).map((club) => club.id));
    if (rows.some((row) => row.clubIds.some((id) => !activeClubs.has(id)))) return json({ error: "unknown_or_inactive_club" }, 400);
    const members = new Map((memberResult.results ?? []).map((member) => [member.discord_user_id, member]));
    const memberships = new Map((membershipResult.results ?? []).map((membership) => [`${membership.member_id}:${membership.club_id}`, membership.status]));
    const unmatchedDiscordIds: string[] = [];
    const inactiveDiscordIds: string[] = [];
    const conflicts: { discordUserId: string; clubId: string; status: string }[] = [];
    const missing: { memberId: number; clubId: string }[] = [];
    let alreadyApproved = 0;
    for (const row of rows) {
      const member = members.get(row.discordUserId);
      if (!member) { unmatchedDiscordIds.push(row.discordUserId); continue; }
      if (member.account_status !== "active") { inactiveDiscordIds.push(row.discordUserId); continue; }
      for (const clubId of row.clubIds) {
        const status = memberships.get(`${member.id}:${clubId}`);
        if (status === "approved") alreadyApproved++;
        else if (status) conflicts.push({ discordUserId: row.discordUserId, clubId, status });
        else missing.push({ memberId: member.id, clubId });
      }
    }
    const summary = { sourceMemberCount: rows.length, sourceMembershipCount: rows.reduce((sum, row) => sum + row.clubIds.length, 0),
      matchedMemberCount: rows.length - unmatchedDiscordIds.length - inactiveDiscordIds.length,
      alreadyApproved, missingCount: missing.length, conflictCount: conflicts.length,
      unmatchedDiscordIds, inactiveDiscordIds, conflicts };
    if (match[1] === "preview") return json({ ...summary, insertedCount: 0, stagedCount: 0 });
    const now = new Date().toISOString();
    const staged = rows.flatMap((row) => row.clubIds.map((clubId) => ({ discordUserId: row.discordUserId, clubId })));
    for (let offset = 0; offset < staged.length; offset += 40) {
      await env.DB.batch(staged.slice(offset, offset + 40).map((item) => env.DB!.prepare(`INSERT INTO discord_club_membership_staging
        (discord_user_id, club_id, imported_at) VALUES (?, ?, ?)
        ON CONFLICT(discord_user_id, club_id) DO UPDATE SET imported_at = excluded.imported_at`)
        .bind(item.discordUserId, item.clubId, now)));
    }
    let insertedCount = 0;
    for (let offset = 0; offset < missing.length; offset += 40) {
      const results = await env.DB.batch(missing.slice(offset, offset + 40).map((item) => env.DB!.prepare(`INSERT INTO club_memberships
        (club_id, member_id, status, source, applied_at, approved_at, updated_at)
        VALUES (?, ?, 'approved', 'discord', ?, ?, ?) ON CONFLICT(club_id, member_id) DO NOTHING`)
        .bind(item.clubId, item.memberId, now, now, now)));
      insertedCount += results.reduce((sum, result) => sum + Number(result.meta?.changes ?? 0), 0);
    }
    await env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (?, 'discord.club_memberships_imported', 'club_membership', ?, ?, ?)`)
      .bind(String(actor.id), now, JSON.stringify({ sourceMemberCount: rows.length, stagedCount: staged.length, insertedCount, conflictCount: conflicts.length,
        unmatchedCount: unmatchedDiscordIds.length, inactiveCount: inactiveDiscordIds.length }), now).run();
    return json({ ...summary, stagedCount: staged.length, insertedCount });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "invalid_import" }, 400);
  }
}
