import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const ENDPOINT = "/api/admin/backup-readiness";

export const REQUIRED_BACKUP_TABLES = [
  "members",
  "member_subscriptions",
  "events",
  "event_participations",
  "clubs",
  "club_memberships",
  "board_threads",
  "board_comments",
  "chat_rooms",
  "chat_messages",
  "in_app_notifications",
  "audit_logs",
  "migration_runs",
] as const;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function isAdmin(member: { role: string; access_role: string }) {
  return member.role === "admin" || member.access_role === "admin";
}

async function r2Summary(bucket: NonNullable<SitesEnv["UPLOADS"]>) {
  let cursor: string | undefined;
  let objectCount = 0;
  let totalBytes = 0;
  for (let page = 0; page < 10_000; page += 1) {
    const result = await bucket.list({ limit: 1_000, ...(cursor ? { cursor } : {}) });
    for (const object of result.objects) {
      objectCount += 1;
      totalBytes += Number.isFinite(object.size) ? object.size : 0;
    }
    if (!result.truncated) return { objectCount, totalBytes };
    if (!result.cursor || result.cursor === cursor) throw new Error("R2一覧の続きを取得できませんでした");
    cursor = result.cursor;
  }
  throw new Error("R2一覧が上限を超えました");
}

export async function handleBackupReadinessRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== ENDPOINT) return null;
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!env.DB || !env.UPLOADS || !env.AUTH_SECRET)
    return json({ error: "バックアップ対象の基盤に接続できません" }, 503);
  const admin = await authenticatedRequestMember(request, env);
  if (!admin) return json({ error: "ログインが必要です" }, 401);
  if (!isAdmin(admin)) return json({ error: "管理者のみ確認できます" }, 403);

  try {
    const [schema, counts, r2] = await Promise.all([
      env.DB.prepare("SELECT value FROM system_metadata WHERE key = ?")
        .bind("platform_schema_version")
        .first<{ value: string }>(),
      env.DB.batch(REQUIRED_BACKUP_TABLES.map((table) => env.DB!.prepare(`SELECT COUNT(*) AS count FROM "${table}"`))),
      r2Summary(env.UPLOADS),
    ]);
    const tableCounts = Object.fromEntries(REQUIRED_BACKUP_TABLES.map((table, index) => {
      const count = Number((counts[index]?.results?.[0] as { count?: unknown } | undefined)?.count);
      if (!Number.isInteger(count) || count < 0) throw new Error(`${table}の件数を確認できませんでした`);
      return [table, count];
    }));
    const schemaVersion = Number(schema?.value);
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1)
      throw new Error("スキーマバージョンを確認できませんでした");
    return json({
      ready: true,
      manifest: {
        version: 1,
        createdAt: new Date().toISOString(),
        sourceEnvironment: "production",
        schemaVersion,
        d1: { tableCounts },
        r2,
      },
    });
  } catch {
    return json({ error: "バックアップ準備状況を集計できませんでした" }, 503);
  }
}
