import { authenticatedRequestMember } from "./auth";
import { minimumXpForRank } from "../lib/xp-levels";
import { DISCORD_AUTHOR_DIRECTORY } from "../constants/discord-author-directory";
import type { SitesEnv } from "./platform-types";
import { normalizeEmail } from "./auth";
import { syncStoredDiscordProfiles } from "./discord-profile-sync";
import boardArchive from "../data/discord-board-2026-08-29.json";
import introductionMemberMetadata from "../data/discord-introduction-member-metadata.json";

const ENDPOINT = "/api/admin/discord-profile-import/commit";
const LINK_ENDPOINT = "/api/admin/discord-profile-import/link";
// A narrowly scoped, administrator-only correction for the verified Discord
// role update made on 2026-09-02. It is idempotent and recorded in
// migration_runs so the live correction remains auditable.
const NORI_TERM_CORRECTION_ENDPOINT = "/api/admin/discord-profile-import/sync-nori-20260902";
type Rank = "regular" | "silver" | "gold" | "platinum";
type ImportRow = { discordUserId: string; displayName: string; avatarUrl: string; bio: string; hasProfileBio: boolean; discordJoinedAt: string | null; discordRoles: string[]; memberTerm: string | null; memberRank: Rank };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const discordAvatarById = new Map(
  DISCORD_AUTHOR_DIRECTORY
    .filter((author) => author.avatarUrl)
    .map((author) => [author.id.replace(/^discord-/, ""), author.avatarUrl]),
);

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
    // The live Discord member response can omit avatars.  The generated
    // author directory is built from the Discord export and supplies a safe
    // per-user fallback without ever assigning somebody else's image.
    const suppliedAvatar = typeof row.avatarUrl === "string" ? row.avatarUrl.trim() : "";
    const avatar = suppliedAvatar || discordAvatarById.get(discordUserId) || "";
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
  const pathname = new URL(request.url).pathname;
  const isNoriTermCorrection = pathname === NORI_TERM_CORRECTION_ENDPOINT;
  if (pathname !== ENDPOINT && pathname !== LINK_ENDPOINT && !isNoriTermCorrection) return null;
  if (!isNoriTermCorrection && request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (isNoriTermCorrection && request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const admin = await authenticatedRequestMember(request, env);
  if (!admin) return json({ error: "ログインが必要です" }, 401);
  if (admin.role !== "admin" && admin.access_role !== "admin") return json({ error: "管理者権限が必要です" }, 403);
  try {
    if (pathname === LINK_ENDPOINT) {
      const input = await request.json() as Record<string, unknown>;
      const email = normalizeEmail(String(input.email ?? ""));
      const discordUserId = String(input.discordUserId ?? "").trim();
      if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{17,20}$/.test(discordUserId) ||
          input.confirmation !== `LINK_DISCORD_${discordUserId}`) return json({ error: "invalid_link_request" }, 400);
      const [target, owner, snapshot] = await Promise.all([
        env.DB.prepare("SELECT id, discord_user_id FROM members WHERE LOWER(TRIM(email)) = ?")
          .bind(email).first<{ id: number; discord_user_id: string | null }>(),
        env.DB.prepare("SELECT id FROM members WHERE discord_user_id = ?")
          .bind(discordUserId).first<{ id: number }>(),
        env.DB.prepare("SELECT discord_user_id FROM discord_profile_snapshots WHERE discord_user_id = ?")
          .bind(discordUserId).first<{ discord_user_id: string }>(),
      ]);
      if (!target) return json({ error: "member_not_found" }, 404);
      if ((owner && owner.id !== target.id) || (target.discord_user_id && target.discord_user_id !== discordUserId))
        return json({ error: "discord_identity_conflict" }, 409);
      const now = new Date().toISOString();
      if (!snapshot) {
        const introduction = boardArchive.threads
          .filter((thread) => thread.category === "introduction" && thread.authorId === discordUserId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        if (!introduction) return json({ error: "discord_profile_not_found" }, 404);
        const metadata = (introductionMemberMetadata as Record<string, { memberTerm?: string | null; joinedAt?: string | null }>)[discordUserId];
        await env.DB.prepare(`INSERT INTO discord_profile_snapshots
          (discord_user_id, display_name, avatar_url, bio, has_profile_bio, discord_joined_at,
           discord_roles_json, member_term, member_rank, imported_at)
          VALUES (?, ?, ?, ?, 1, ?, '[]', ?, 'regular', ?)`)
          .bind(discordUserId, introduction.authorName, introduction.authorAvatarUrl ?? "",
            introduction.content, metadata?.joinedAt ?? null, metadata?.memberTerm ?? null, now).run();
      }
      await env.DB.batch([
        env.DB.prepare("UPDATE members SET discord_user_id = ?, updated_at = ? WHERE id = ? AND (discord_user_id IS NULL OR discord_user_id = ?)")
          .bind(discordUserId, now, target.id, discordUserId),
        env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
          VALUES (?, 'member.discord_identity_linked', 'member', ?, ?, ?)`)
          .bind(String(admin.id), String(target.id), JSON.stringify({ discordUserId }), now),
      ]);
      await syncStoredDiscordProfiles(env.DB, now, [discordUserId]).run();
      return json({ success: true, memberId: target.id, discordUserId });
    }
    const rows = validateDiscordProfileImport(isNoriTermCorrection
      ? {
          confirmation: "IMPORT_DISCORD_PROFILES_1",
          rows: [{
            discordUserId: "1228678386902372374",
            displayName: "nori🏃ランニング部長【💎PLATINUM 】",
            avatarUrl: "https://cdn.discordapp.com/avatars/1228678386902372374/04a71500e3608ede85dd9aef73d334b7.png?size=512",
            bio: "",
            hasProfileBio: false,
            discordJoinedAt: "2024-04-13T12:12:43.937000Z",
            discordRoles: ["昼飲み部🍺", "スポーツ観戦部⚾️", "旅行部✈️", "【部長】ランニング部🏃", "第1期メンバー", "レギュラー会員", "関東支部", "💎PLATINUM会員"],
            memberTerm: "第1期",
            memberRank: "platinum",
          }],
        }
      : await request.json());
    const existing = await env.DB.prepare("SELECT id, discord_user_id FROM members WHERE discord_user_id IS NOT NULL").all<{ id: number; discord_user_id: string }>();
    const ids = new Map((existing.results ?? []).map((member) => [member.discord_user_id, member.id]));
    const matched = rows.filter((row) => ids.has(row.discordUserId));
    const unmatchedIds = rows.filter((row) => !ids.has(row.discordUserId)).map((row) => row.discordUserId);
    const now = new Date().toISOString();
    const snapshots = rows.map((row) => env.DB!.prepare(`INSERT INTO discord_profile_snapshots
      (discord_user_id, display_name, avatar_url, bio, has_profile_bio, discord_joined_at,
       discord_roles_json, member_term, member_rank, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(discord_user_id) DO UPDATE SET display_name = excluded.display_name,
        avatar_url = excluded.avatar_url, bio = excluded.bio,
        has_profile_bio = excluded.has_profile_bio, discord_joined_at = excluded.discord_joined_at,
        discord_roles_json = excluded.discord_roles_json, member_term = excluded.member_term,
        member_rank = excluded.member_rank, imported_at = excluded.imported_at`)
      .bind(row.discordUserId, row.displayName, row.avatarUrl, row.bio, row.hasProfileBio ? 1 : 0,
        row.discordJoinedAt, JSON.stringify(row.discordRoles), row.memberTerm, row.memberRank, now));
    const statements = matched.map((row) => env.DB!.prepare(`UPDATE members SET
      display_name = CASE WHEN ? != '' THEN ? ELSE display_name END,
      -- A confirmed Discord term-role correction is authoritative.  We only
      -- receive this endpoint from an administrator, and it lets a corrected
      -- role (for example 第6期 -> 第1期) reach the app without changing
      -- app-authored profile fields.
      member_term = CASE WHEN ? IS NOT NULL AND ? <> '' THEN ? ELSE member_term END,
      member_rank = ?, discord_roles_json = ?, discord_joined_at = COALESCE(?, discord_joined_at),
      xp = CASE WHEN COALESCE(xp, 0) <= 0 THEN ? ELSE xp END,
      profile_json = json_set(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END,
        '$.bio', CASE WHEN ? THEN ? ELSE COALESCE(json_extract(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END, '$.bio'), '') END,
        -- An app-set avatar wins; Discord only fills gaps left by migration.
        '$.avatarUrl', CASE WHEN COALESCE(json_extract(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END, '$.avatarUrl'), '') = '' AND ? != '' THEN ? ELSE COALESCE(json_extract(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END, '$.avatarUrl'), '') END),
      updated_at = ? WHERE id = ?`).bind(row.displayName, row.displayName, row.memberTerm, row.memberTerm, row.memberTerm, row.memberRank, JSON.stringify(row.discordRoles), row.discordJoinedAt, minimumXpForRank(row.memberRank), row.hasProfileBio ? 1 : 0, row.bio, row.avatarUrl, row.avatarUrl, now, ids.get(row.discordUserId)));
    for (let index = 0; index < snapshots.length; index += 50) {
      await env.DB.batch(snapshots.slice(index, index + 50));
    }
    for (let index = 0; index < statements.length; index += 50) {
      await env.DB.batch(statements.slice(index, index + 50));
    }
    await env.DB.prepare(`INSERT INTO club_memberships (club_id, member_id, status, source, applied_at, approved_at, updated_at)
      SELECT c.id, m.id, 'approved', 'discord', ?, ?, ? FROM clubs c JOIN members m CROSS JOIN json_each(CASE WHEN json_valid(m.discord_roles_json) THEN m.discord_roles_json ELSE '[]' END) r
      WHERE CAST(r.value AS TEXT) LIKE '%' || c.name || '%' ON CONFLICT(club_id, member_id) DO UPDATE SET status = 'approved', source = 'discord', updated_at = excluded.updated_at`).bind(now, now, now).run();
    const runId = `discord-profile-${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO migration_runs (id, migration_type, source_filename, status, imported_count, skipped_count, error_count, summary_json, started_at, completed_at)
      VALUES (?, 'discord_profiles', 'discord-live-2026-08-30', 'completed', ?, ?, 0, ?, ?, ?)`).bind(runId, matched.length, unmatchedIds.length, JSON.stringify({ requestedCount: rows.length, matchedCount: matched.length, unmatchedIds }), now, now).run();
    // An unmatched import is not a successful migration: those profiles would
    // otherwise disappear without any indication to the operator.
    return json({ success: unmatchedIds.length === 0, runId, requestedCount: rows.length,
      matchedCount: matched.length, unmatchedCount: unmatchedIds.length, unmatchedIds });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message.split(":")[0] : "invalid_request" }, 400);
  }
}
