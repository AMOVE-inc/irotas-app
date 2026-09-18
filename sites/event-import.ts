import { authenticatedRequestMember } from "./auth";
import { mergeImportedEvent, type ImportEventShape } from "../lib/event-import-merge";
import type { D1Database, SitesEnv } from "./platform-types";
import { canonicalClubId } from "../lib/club-id";

const ROOT = "/api/admin/event-import";
const DRY_RUN = `${ROOT}/dry-run`;
const COMMIT = `${ROOT}/commit`;
const RESOLVE = /^\/api\/admin\/event-import\/conflicts\/([^/]+)\/resolve$/;
const MAX_BODY = 5 * 1024 * 1024;

type Viewer = NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>;
type IncomingItem = { sourceThreadId: string; organizerMemberId?: number; organizerDiscordUserId?: string; event: ImportEventShape };
type ExistingRow = { id: string; organizer_member_id: number; event_type: ImportEventShape["eventType"]; club_id: string | null; event_date: string; status: ImportEventShape["status"]; title: string; public_data_json: string };

function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "cache-control": "private, no-store" } }); }
function admin(viewer: Viewer) { return viewer.role === "admin" || viewer.access_role === "admin"; }

async function body(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return null;
  try { const value = JSON.parse(raw); return value && typeof value === "object" ? value as Record<string, unknown> : null; } catch { return null; }
}

function safeText(value: unknown, max: number) { return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null; }
function normalizeThreadId(value: unknown) {
  const raw = safeText(value, 128)?.replace(/^discord-event-/, "").replace(/^discord-board-/, "");
  return raw && /^\d{10,30}$/.test(raw) ? raw : null;
}

function inputItem(value: unknown): IncomingItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const threadId = normalizeThreadId(raw.sourceThreadId);
  const event = raw.event && typeof raw.event === "object" ? raw.event as Record<string, unknown> : null;
  const title = safeText(event?.title, 160);
  const eventDate = safeText(event?.eventDate ?? event?.date, 10);
  const eventType = String(event?.eventType);
  const status = String(event?.status);
  const publicData = event?.publicData && typeof event.publicData === "object" && !Array.isArray(event.publicData) ? event.publicData as Record<string, unknown> : {};
  if (!threadId || !title || !eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !["official", "gourmet", "club"].includes(eventType) || !["open", "full", "ended", "cancelled"].includes(status)) return null;
  const organizerMemberId = Number(raw.organizerMemberId);
  const organizerDiscordUserId = safeText(raw.organizerDiscordUserId, 20);
  return {
    sourceThreadId: threadId,
    organizerMemberId: Number.isInteger(organizerMemberId) && organizerMemberId > 0 ? organizerMemberId : undefined,
    organizerDiscordUserId: organizerDiscordUserId && /^\d{17,20}$/.test(organizerDiscordUserId) ? organizerDiscordUserId : undefined,
    event: { title, eventDate, eventType: eventType as ImportEventShape["eventType"], clubId: canonicalClubId(safeText(event?.clubId, 80)), status: status as ImportEventShape["status"], publicData },
  };
}

function parseRow(row: ExistingRow): ImportEventShape {
  let publicData: Record<string, unknown> = {};
  try { publicData = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
  return { title: row.title, eventDate: row.event_date, eventType: row.event_type, clubId: row.club_id, status: row.status, publicData };
}

async function analyze(db: D1Database, items: IncomingItem[]) {
  const counts = { created: 0, updated: 0, preserved: 0, conflicted: 0, skipped: 0 };
  const decisions: Record<string, unknown>[] = [];
  // Resolve authors and source event IDs in batches.  The previous one-query-at-a-time
  // approach was safe but slow enough for a browser request to time out.
  const [memberResult, eventResults, deletedResult] = await Promise.all([
    db.prepare("SELECT id, discord_user_id FROM members WHERE discord_user_id IS NOT NULL").all<{ id: number; discord_user_id: string }>(),
    db.batch<ExistingRow>(items.map((item) => db.prepare("SELECT id, organizer_member_id, event_type, club_id, event_date, status, title, public_data_json FROM events WHERE id = ?").bind(`discord-event-${item.sourceThreadId}`))),
    db.prepare("SELECT event_id FROM deleted_imported_events").all<{ event_id: string }>(),
  ]);
  const deletedIds = new Set((deletedResult.results ?? []).map((row) => row.event_id));
  const membersByDiscordId = new Map((memberResult.results ?? []).map((member) => [member.discord_user_id, member.id]));
  const existingById = new Map<string, ExistingRow>();
  for (let index = 0; index < items.length; index += 1) {
    const row = eventResults[index]?.results?.[0];
    if (row) existingById.set(`discord-event-${items[index].sourceThreadId}`, row);
  }
  const existingIds = [...existingById.keys()];
  const editResults = existingIds.length
    ? await db.batch<{ field_name: string }>(existingIds.map((eventId) => db.prepare("SELECT field_name FROM event_import_field_edits WHERE event_id = ?").bind(eventId)))
    : [];
  const editsById = new Map<string, Set<string>>();
  existingIds.forEach((eventId, index) => editsById.set(eventId, new Set((editResults[index]?.results ?? []).map((edit) => edit.field_name))));

  for (const item of items) {
    if (!item.organizerMemberId && item.organizerDiscordUserId) item.organizerMemberId = membersByDiscordId.get(item.organizerDiscordUserId);
    const eventId = `discord-event-${item.sourceThreadId}`;
    if (deletedIds.has(eventId)) { counts.skipped += 1; decisions.push({ sourceThreadId: item.sourceThreadId, eventId, action: "skipped", reason: "deleted_by_admin" }); continue; }
    const row = existingById.get(eventId);
    if (!row) {
      if (!item.organizerMemberId) { counts.skipped += 1; decisions.push({ sourceThreadId: item.sourceThreadId, eventId, action: "skipped", reason: "organizerMemberId_required" }); }
      else { counts.created += 1; decisions.push({ sourceThreadId: item.sourceThreadId, eventId, action: "created", item }); }
      continue;
    }
    const result = mergeImportedEvent(parseRow(row), item.event, editsById.get(eventId) ?? new Set());
    if (result.conflicts.length) counts.conflicted += 1;
    else if (result.changedFields.length) counts.updated += 1;
    else counts.preserved += 1;
    decisions.push({ sourceThreadId: item.sourceThreadId, eventId, action: result.conflicts.length ? "conflicted" : result.changedFields.length ? "updated" : "preserved", item, merged: result.merged, changedFields: result.changedFields, conflicts: result.conflicts });
  }
  return { counts, decisions };
}

async function applyCommit(db: D1Database, viewer: Viewer, input: Record<string, unknown>, items: IncomingItem[]) {
  const analysis = await analyze(db, items);
  if (input.confirmation !== `APPLY_${items.length}_EVENTS`) return json({ error: `確認文字列 APPLY_${items.length}_EVENTS が必要です`, dryRun: analysis }, 409);
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO migration_runs (id, migration_type, status, summary_json, started_at) VALUES (?, 'discord_event_safe_merge', 'started', ?, ?)").bind(runId, JSON.stringify({ sourceSnapshotAt: input.snapshotAt ?? null, counts: analysis.counts }), now).run();
  for (const decision of analysis.decisions as Array<Record<string, any>>) {
    const item = decision.item as IncomingItem | undefined;
    if (!item || decision.action === "skipped" || decision.action === "preserved") continue;
    if (decision.action === "created") {
      await db.batch([
        db.prepare("INSERT INTO events (id, organizer_member_id, event_type, club_id, event_date, status, title, public_data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(decision.eventId, item.organizerMemberId, item.event.eventType, item.event.clubId ?? null, item.event.eventDate, item.event.status, item.event.title, JSON.stringify(item.event.publicData), now, now),
        db.prepare("INSERT INTO event_import_sources (event_id, source_thread_id, source_snapshot_at, source_data_json, applied_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(decision.eventId, item.sourceThreadId, String(input.snapshotAt ?? now), JSON.stringify(item.event), now, now),
      ]);
      continue;
    }
    const merged = decision.merged as ImportEventShape;
    await db.batch([
      db.prepare("UPDATE events SET event_type = ?, club_id = ?, event_date = ?, status = ?, title = ?, public_data_json = ?, updated_at = ? WHERE id = ?").bind(merged.eventType, merged.clubId ?? null, merged.eventDate, merged.status, merged.title, JSON.stringify(merged.publicData), now, decision.eventId),
      db.prepare("INSERT INTO event_import_sources (event_id, source_thread_id, source_snapshot_at, source_data_json, applied_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(event_id) DO UPDATE SET source_snapshot_at = excluded.source_snapshot_at, source_data_json = excluded.source_data_json, applied_at = excluded.applied_at, updated_at = excluded.updated_at").bind(decision.eventId, item.sourceThreadId, String(input.snapshotAt ?? now), JSON.stringify(item.event), now, now),
    ]);
    for (const conflict of decision.conflicts ?? []) await db.prepare("INSERT INTO event_import_conflicts (id, run_id, event_id, source_thread_id, field_name, current_value_json, incoming_value_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), runId, decision.eventId, item.sourceThreadId, conflict.field, JSON.stringify(conflict.current ?? null), JSON.stringify(conflict.incoming ?? null), now).run();
  }
  await db.prepare("UPDATE migration_runs SET status = 'completed', imported_count = ?, skipped_count = ?, error_count = 0, summary_json = ?, completed_at = ? WHERE id = ?").bind(analysis.counts.created + analysis.counts.updated, analysis.counts.skipped, JSON.stringify(analysis.counts), now, runId).run();
  return json({ success: true, runId, ...analysis });
}

async function resolve(request: Request, db: D1Database, viewer: Viewer, conflictId: string) {
  const input = await body(request);
  if (!input || !["approve", "reject"].includes(String(input.decision)) || input.confirmation !== `RESOLVE_${conflictId}`) return json({ error: "競合の確認内容を確認してください" }, 400);
  const conflict = await db.prepare("SELECT * FROM event_import_conflicts WHERE id = ? AND status = 'pending'").bind(conflictId).first<Record<string, unknown>>();
  if (!conflict) return json({ error: "未処理の競合が見つかりません" }, 404);
  const now = new Date().toISOString();
  if (input.decision === "approve") {
    const value = JSON.parse(String(conflict.incoming_value_json));
    if (conflict.field === "title") await db.prepare("UPDATE events SET title = ?, updated_at = ? WHERE id = ?").bind(String(value), now, conflict.event_id).run();
    else if (["eventDate", "eventType", "clubId", "status"].includes(String(conflict.field))) {
      const column = ({ eventDate: "event_date", eventType: "event_type", clubId: "club_id", status: "status" } as Record<string, string>)[String(conflict.field)];
      await db.prepare(`UPDATE events SET ${column} = ?, updated_at = ? WHERE id = ?`).bind(value, now, conflict.event_id).run();
    } else {
      const row = await db.prepare("SELECT public_data_json FROM events WHERE id = ?").bind(conflict.event_id).first<{ public_data_json: string }>();
      const data = JSON.parse(row?.public_data_json ?? "{}"); data[String(conflict.field)] = value;
      await db.prepare("UPDATE events SET public_data_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(data), now, conflict.event_id).run();
    }
  }
  await db.prepare("UPDATE event_import_conflicts SET status = ?, resolved_at = ?, resolved_by_member_id = ? WHERE id = ? AND status = 'pending'").bind(input.decision === "approve" ? "approved" : "rejected", now, viewer.id, conflictId).run();
  return json({ success: true, status: input.decision === "approve" ? "approved" : "rejected" });
}

export async function handleEventImportRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const resolveMatch = RESOLVE.exec(pathname);
  if (pathname !== DRY_RUN && pathname !== COMMIT && !resolveMatch) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer) return json({ error: "ログインが必要です" }, 401);
  if (!admin(viewer)) return json({ error: "管理者のみ実行できます" }, 403);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (resolveMatch) return resolve(request, env.DB, viewer, decodeURIComponent(resolveMatch[1]));
  const input = await body(request);
  const rawItems = input && Array.isArray(input.events) ? input.events : [];
  const items = rawItems.map(inputItem);
  if (!input || !rawItems.length || items.some((item) => !item) || rawItems.length > 2_000) return json({ error: "移行データを確認してください" }, 400);
  const normalized = items as IncomingItem[];
  // A commit performs its own analysis immediately before writing. Avoiding a
  // second identical pass keeps browser-triggered archive imports within the
  // Worker request time limit.
  if (pathname === DRY_RUN) {
    const analysis = await analyze(env.DB, normalized);
    return json({ dryRun: true, ...analysis });
  }
  return applyCommit(env.DB, viewer, input, normalized);
}
