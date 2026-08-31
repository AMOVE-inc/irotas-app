import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const ENDPOINT = "/api/admin/backups";

function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "cache-control": "private, no-store" } }); }
function admin(member: { role: string; access_role: string }) { return member.role === "admin" || member.access_role === "admin"; }
function quoted(identifier: string) { return `"${identifier.replace(/"/g, '""')}"`; }

async function exportTable(db: D1Database, table: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 2_000_000; offset += 1_000) {
    const page = await db.prepare(`SELECT * FROM ${quoted(table)} LIMIT 1000 OFFSET ?`).bind(offset).all<Record<string, unknown>>();
    const results = page.results ?? [];
    rows.push(...results);
    if (results.length < 1_000) return rows;
  }
  throw new Error(`${table} exceeds backup row limit`);
}

async function createBackup(db: D1Database, bucket: NonNullable<SitesEnv["UPLOADS"]>, memberId: number) {
  const [tablesResult, schemaResult, schemaVersion] = await Promise.all([
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>(),
    db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name").all<Record<string, unknown>>(),
    db.prepare("SELECT value FROM system_metadata WHERE key = 'platform_schema_version'").first<{ value: string }>(),
  ]);
  // Cloudflare adds protected internal tables such as `_cf_KV`; they cannot be read
  // through D1 and are not application data, so never include underscore-prefixed tables.
  const tables = (tablesResult.results ?? []).map((row) => row.name)
    .filter((name) => /^[A-Za-z0-9_]+$/.test(name) && !name.startsWith("_") && name !== "backup_snapshots");
  const data: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};
  for (const table of tables) { data[table] = await exportTable(db, table); counts[table] = data[table].length; }
  const createdAt = new Date().toISOString();
  const payload = JSON.stringify({ format: "irotas-d1-backup-v1", createdAt, schemaVersion: Number(schemaVersion?.value ?? 0), schema: schemaResult.results ?? [], tableCounts: counts, tables: data });
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
  const id = crypto.randomUUID();
  const objectKey = `private-backups/d1/${createdAt.replace(/[:.]/g, "-")}-${id}.json`;
  await bucket.put(objectKey, bytes.buffer, { httpMetadata: { contentType: "application/json" } });
  await db.batch([
    db.prepare("INSERT INTO backup_snapshots (id, object_key, schema_version, byte_size, sha256, table_counts_json, created_by_member_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, objectKey, Number(schemaVersion?.value ?? 0), bytes.byteLength, sha256, JSON.stringify(counts), memberId, createdAt),
    db.prepare("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, 'backup.created', 'backup_snapshot', ?, ?, ?)").bind(String(memberId), id, JSON.stringify({ objectKey, byteSize: bytes.byteLength, sha256, tableCounts: counts }), createdAt),
  ]);
  return { id, createdAt, schemaVersion: Number(schemaVersion?.value ?? 0), byteSize: bytes.byteLength, sha256, tableCounts: counts };
}

export async function handleBackupRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== ENDPOINT) return null;
  if (!env.DB || !env.UPLOADS || !env.AUTH_SECRET) return json({ error: "バックアップ基盤に接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer) return json({ error: "ログインが必要です" }, 401);
  if (!admin(viewer)) return json({ error: "管理者のみ実行できます" }, 403);
  if (request.method === "GET") {
    const rows = await env.DB.prepare("SELECT id, schema_version, byte_size, sha256, table_counts_json, created_at FROM backup_snapshots ORDER BY created_at DESC LIMIT 20").all<Record<string, unknown>>();
    return json({ backups: (rows.results ?? []).map((row) => ({ id: row.id, schemaVersion: row.schema_version, byteSize: row.byte_size, sha256: row.sha256, tableCounts: JSON.parse(String(row.table_counts_json)), createdAt: row.created_at })) });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try { return json({ success: true, backup: await createBackup(env.DB, env.UPLOADS, viewer.id) }, 201); }
  catch (error) {
    // This is deliberately limited to a server-side diagnostic: the client keeps a generic error.
    console.error("backup.create.failed", error instanceof Error ? error.message : "unknown_error");
    return json({ error: "DBバックアップを作成できませんでした" }, 503);
  }
}
