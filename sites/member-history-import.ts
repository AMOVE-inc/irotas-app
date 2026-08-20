import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const ENDPOINT = "/api/admin/member-history-import/commit";
const MAX_ROWS = 1_000;
const MAX_REQUEST_BYTES = 256 * 1024;

export type ValidatedMemberHistoryRow = {
  discordUserId: string;
  participationCount: number;
  organizerCount: number;
};

type ImportBody = {
  confirmation?: unknown;
  sourceFilename?: unknown;
  rows?: unknown;
};

function responseJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function safeFilename(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized && normalized.length <= 120 ? normalized : null;
}

export function validateMemberHistoryImport(body: ImportBody) {
  if (!Array.isArray(body.rows) || body.rows.length < 1)
    throw new Error("rows_required");
  if (body.rows.length > MAX_ROWS) throw new Error("too_many_rows");
  if (body.confirmation !== `IMPORT_HISTORY_${body.rows.length}`)
    throw new Error("confirmation_required");

  const seen = new Set<string>();
  const rows = body.rows.map((value, index) => {
    if (!value || typeof value !== "object")
      throw new Error(`invalid_row:${index}`);
    const row = value as Record<string, unknown>;
    const discordUserId = String(row.discordUserId ?? "").trim();
    const participationCount = Number(row.participationCount);
    const organizerCount = Number(row.organizerCount);
    if (!/^\d{17,20}$/.test(discordUserId))
      throw new Error(`invalid_discord_id:${index}`);
    if (seen.has(discordUserId))
      throw new Error(`duplicate_discord_id:${index}`);
    seen.add(discordUserId);
    for (const [label, count] of [
      ["participation_count", participationCount],
      ["organizer_count", organizerCount],
    ] as const) {
      if (!Number.isSafeInteger(count) || count < 0 || count > 10_000)
        throw new Error(`invalid_${label}:${index}`);
    }
    return { discordUserId, participationCount, organizerCount };
  });
  return { rows, sourceFilename: safeFilename(body.sourceFilename) };
}

async function importMemberHistory(
  db: D1Database,
  rows: ValidatedMemberHistoryRow[],
  actorMemberId: number,
  sourceFilename: string | null,
) {
  const memberResult = await db
    .prepare("SELECT id, discord_user_id FROM members WHERE discord_user_id IS NOT NULL")
    .all<{ id: number; discord_user_id: string }>();
  const membersByDiscordId = new Map(
    (memberResult.results ?? []).map((member) => [member.discord_user_id, member.id]),
  );
  const matched = rows.filter((row) => membersByDiscordId.has(row.discordUserId));
  const unmatched = rows.filter((row) => !membersByDiscordId.has(row.discordUserId));
  const runId = `history-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const summary = {
    requestedCount: rows.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    participationTotal: matched.reduce((sum, row) => sum + row.participationCount, 0),
    organizerTotal: matched.reduce((sum, row) => sum + row.organizerCount, 0),
  };
  const statements = [
    db.prepare(
      `INSERT INTO migration_runs
       (id, migration_type, source_filename, status, imported_count, skipped_count,
        error_count, summary_json, started_at, completed_at)
       VALUES (?, 'member_history', ?, 'completed', ?, ?, 0, ?, ?, ?)`,
    ).bind(
      runId,
      sourceFilename,
      matched.length,
      unmatched.length,
      JSON.stringify(summary),
      now,
      now,
    ),
    ...matched.map((row) =>
      db.prepare(
        `UPDATE members
         SET participation_count = ?, organizer_count = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(
        row.participationCount,
        row.organizerCount,
        now,
        membersByDiscordId.get(row.discordUserId),
      ),
    ),
    db.prepare(
      `INSERT INTO audit_logs
       (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
       VALUES (?, 'members.history_import', 'migration_run', ?, ?, ?)`,
    ).bind(String(actorMemberId), runId, JSON.stringify(summary), now),
  ];
  await db.batch(statements);
  return { runId, ...summary };
}

export async function handleMemberHistoryImportRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== ENDPOINT) return null;
  if (request.method !== "POST")
    return responseJson({ error: "method_not_allowed" }, 405);
  if (!env.DB)
    return responseJson({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return responseJson({ error: "ログインが必要です" }, 401);
  if (member.role !== "admin" && member.access_role !== "admin")
    return responseJson({ error: "管理者権限が必要です" }, 403);
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json"))
    return responseJson({ error: "JSON形式で送信してください" }, 415);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES)
    return responseJson({ error: "リクエストが大きすぎます" }, 413);
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES)
      return responseJson({ error: "リクエストが大きすぎます" }, 413);
    const validated = validateMemberHistoryImport(JSON.parse(rawBody) as ImportBody);
    const result = await importMemberHistory(
      env.DB,
      validated.rows,
      member.id,
      validated.sourceFilename,
    );
    return responseJson({ success: true, ...result });
  } catch (error) {
    if (error instanceof SyntaxError)
      return responseJson({ error: "JSON形式が正しくありません" }, 400);
    const code = error instanceof Error ? error.message.split(":")[0] : "invalid_request";
    const clientErrors = new Set([
      "rows_required", "too_many_rows", "confirmation_required", "invalid_row",
      "invalid_discord_id", "duplicate_discord_id", "invalid_participation_count",
      "invalid_organizer_count",
    ]);
    return clientErrors.has(code)
      ? responseJson({ error: code }, 400)
      : responseJson({ error: "参加・幹事履歴を登録できませんでした" }, 500);
  }
}

