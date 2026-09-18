import { authenticatedRequestMember } from "./auth";
import { syncStoredDiscordProfiles } from "./discord-profile-sync";
import type { SitesEnv } from "./platform-types";

const PATH = /^\/api\/admin\/discord-identity-link\/(preview|commit)$/;
const MAX_BYTES = 64 * 1024;
const MAX_ROWS = 50;

type SourceRow = { discordUserId: string; discordUsername: string; displayName: string; memberTerm: string; birthDates: string[] };
type Candidate = { id: number; public_member_id: string | null; display_name: string; member_term: string | null; profile_json: string | null };
type MatchMethod = "name_birth_date" | "unique_birth_date" | "name_term_missing_birth_date" | "name_missing_profile_fields";
type Match = { row: SourceRow; candidate: Candidate; method: MatchMethod };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const normalized = (value: string) => value.normalize("NFKC").trim().replace(/[\s\u3000]+/g, "").toLocaleLowerCase("ja-JP");
const termNumber = (value: string | null) => value?.match(/\d+/)?.[0] ?? null;

function birthDateOf(candidate: Candidate): string | null {
  try {
    const profile = JSON.parse(candidate.profile_json || "{}") as Record<string, unknown>;
    return typeof profile.birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate) ? profile.birthDate : null;
  } catch { return null; }
}

export function validateDiscordIdentityLink(input: unknown): SourceRow[] {
  if (!input || typeof input !== "object") throw new Error("invalid_body");
  const value = input as { rows?: unknown; confirmation?: unknown };
  if (!Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > MAX_ROWS) throw new Error("invalid_rows");
  if (value.confirmation !== `LINK_SHEET_DISCORD_${value.rows.length}`) throw new Error("confirmation_required");
  const ids = new Set<string>();
  const usernames = new Set<string>();
  return value.rows.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`invalid_row:${index}`);
    const row = raw as Record<string, unknown>;
    const discordUserId = String(row.discordUserId ?? "").trim();
    const discordUsername = String(row.discordUsername ?? "").trim();
    const displayName = String(row.displayName ?? "").trim();
    const memberTerm = String(row.memberTerm ?? "").trim();
    const birthDates = Array.isArray(row.birthDates) ? [...new Set(row.birthDates.map((date) => String(date).trim()))] : [];
    if (!/^\d{17,20}$/.test(discordUserId) || ids.has(discordUserId)) throw new Error(`invalid_discord_id:${index}`);
    if (!/^[^\s]{2,64}$/.test(discordUsername) || usernames.has(discordUsername.toLocaleLowerCase())) throw new Error(`invalid_discord_username:${index}`);
    if (!displayName || displayName.length > 120) throw new Error(`invalid_display_name:${index}`);
    if (!/^第\d+期$/.test(memberTerm)) throw new Error(`invalid_member_term:${index}`);
    if (birthDates.length < 1 || birthDates.length > 3 || birthDates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error(`invalid_birth_dates:${index}`);
    ids.add(discordUserId); usernames.add(discordUsername.toLocaleLowerCase());
    return { discordUserId, discordUsername, displayName, memberTerm, birthDates };
  });
}

export function matchDiscordIdentities(rows: SourceRow[], candidates: Candidate[]) {
  const matched: Match[] = [];
  const unresolved: { discordUsername: string; reason: "not_found" | "ambiguous"; candidateCount: number;
    nameCandidateCount: number; birthDateCandidateCount: number; termCandidateCount: number }[] = [];
  const claimedMemberIds = new Set<number>();
  for (const row of rows) {
    const available = candidates.filter((candidate) => !claimedMemberIds.has(candidate.id));
    const termCandidates = available.filter((candidate) => termNumber(candidate.member_term) === termNumber(row.memberTerm));
    const sameName = available.filter((candidate) => normalized(candidate.display_name) === normalized(row.displayName));
    const sameBirthDate = available.filter((candidate) => { const birthDate = birthDateOf(candidate); return birthDate !== null && row.birthDates.includes(birthDate); });
    const strict = sameName.filter((candidate) => sameBirthDate.some((birthCandidate) => birthCandidate.id === candidate.id));
    let selected: Candidate[] = [];
    let method: MatchMethod | null = null;
    if (strict.length === 1) { selected = strict; method = "name_birth_date"; }
    else if (strict.length === 0 && sameBirthDate.length === 1) { selected = sameBirthDate; method = "unique_birth_date"; }
    else if (strict.length === 0 && sameBirthDate.length === 0) {
      const nameWithoutBirthDate = sameName.filter((candidate) => birthDateOf(candidate) === null);
      selected = nameWithoutBirthDate.filter((candidate) => termNumber(candidate.member_term) === termNumber(row.memberTerm));
      if (selected.length === 1) method = "name_term_missing_birth_date";
      else if (selected.length === 0) {
        selected = nameWithoutBirthDate.filter((candidate) => termNumber(candidate.member_term) === null);
        if (selected.length === 1) method = "name_missing_profile_fields";
      }
    } else selected = strict;
    if (selected.length !== 1 || !method) {
      unresolved.push({ discordUsername: row.discordUsername, reason: selected.length > 1 ? "ambiguous" : "not_found", candidateCount: selected.length,
        nameCandidateCount: sameName.length, birthDateCandidateCount: sameBirthDate.length, termCandidateCount: termCandidates.length });
      continue;
    }
    claimedMemberIds.add(selected[0].id);
    matched.push({ row, candidate: selected[0], method });
  }
  return { matched, unresolved };
}

export async function handleDiscordIdentityLinkRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathMatch = PATH.exec(new URL(request.url).pathname);
  if (!pathMatch) return null;
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.DB) return json({ error: "database_unavailable" }, 503);
  const actor = await authenticatedRequestMember(request, env);
  if (!actor) return json({ error: "authentication_required" }, 401);
  if (actor.role !== "admin" && actor.access_role !== "admin") return json({ error: "admin_required" }, 403);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return json({ error: "too_large" }, 413);
  try {
    const rows = validateDiscordIdentityLink(JSON.parse(raw) as unknown);
    const [candidateResult, ownerResult] = await Promise.all([
      env.DB.prepare(`SELECT id, public_member_id, display_name, member_term, profile_json FROM members
        WHERE account_status = 'active' AND discord_user_id IS NULL AND COALESCE(json_extract(profile_json, '$.isTestAccount'), 0) <> 1`).all<Candidate>(),
      env.DB.prepare("SELECT id, discord_user_id FROM members WHERE discord_user_id IS NOT NULL").all<{ id: number; discord_user_id: string }>(),
    ]);
    const existingOwners = new Set((ownerResult.results ?? []).map((owner) => owner.discord_user_id));
    const ownershipConflicts = rows.filter((row) => existingOwners.has(row.discordUserId)).map((row) => row.discordUsername);
    if (ownershipConflicts.length) return json({ error: "discord_identity_conflict", ownershipConflicts }, 409);
    const result = matchDiscordIdentities(rows, candidateResult.results ?? []);
    const responseMatches = result.matched.map(({ row, candidate, method }) => ({ discordUsername: row.discordUsername, discordDisplayName: row.displayName,
      memberId: candidate.public_member_id ?? `member-${candidate.id}`, memberDisplayName: candidate.display_name, method }));
    if (pathMatch[1] === "preview") return json({ requestedCount: rows.length, matchedCount: result.matched.length, matches: responseMatches, unresolved: result.unresolved });
    if (result.unresolved.length || result.matched.length !== rows.length) return json({ error: "identity_confirmation_incomplete", requestedCount: rows.length,
      matchedCount: result.matched.length, matches: responseMatches, unresolved: result.unresolved }, 409);
    const now = new Date().toISOString();
    await env.DB.batch(result.matched.flatMap(({ row, candidate, method }) => [
      env.DB!.prepare("UPDATE members SET discord_user_id = ?, updated_at = ? WHERE id = ? AND discord_user_id IS NULL").bind(row.discordUserId, now, candidate.id),
      env.DB!.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, 'member.discord_identity_linked_from_club_form', 'member', ?, ?, ?)`).bind(String(actor.id), String(candidate.id),
          JSON.stringify({ discordUserId: row.discordUserId, discordUsername: row.discordUsername, method }), now),
    ]));
    await syncStoredDiscordProfiles(env.DB, now, rows.map((row) => row.discordUserId), { overwriteDisplayName: true }).run();
    const membershipResult = await env.DB.prepare(`INSERT INTO club_memberships (club_id, member_id, status, source, applied_at, approved_at, updated_at)
      SELECT s.club_id, m.id, 'approved', 'discord', ?, ?, ? FROM discord_club_membership_staging s JOIN members m ON m.discord_user_id = s.discord_user_id
      WHERE s.discord_user_id IN (${rows.map(() => "?").join(",")}) ON CONFLICT(club_id, member_id) DO NOTHING`)
      .bind(now, now, now, ...rows.map((row) => row.discordUserId)).run();
    return json({ success: true, requestedCount: rows.length, linkedCount: result.matched.length,
      membershipsInserted: Number(membershipResult.meta?.changes ?? 0), matches: responseMatches });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "invalid_import" }, 400); }
}
