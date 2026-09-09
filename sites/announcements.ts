import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const ROOT = "/api/announcements";
const ITEM = /^\/api\/announcements\/([^/]+)$/;

type Viewer = NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
}

function isAdmin(viewer: Viewer) {
  return viewer.role === "admin" || viewer.access_role === "admin";
}

async function readBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 32 * 1024) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function input(value: Record<string, unknown>) {
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const content = typeof value.content === "string" ? value.content.trim() : "";
  if (!title || !content || title.length > 200 || content.length > 10_000) return null;
  return { title, content };
}

async function list(db: D1Database) {
  const rows = await db.prepare("SELECT id, title, content, created_at FROM announcements WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 100").all<{ id: string; title: string; content: string; created_at: string }>();
  return json({ announcements: (rows.results ?? []).map((row) => ({ id: row.id, title: row.title, content: row.content, createdAt: row.created_at.slice(0, 10) })) });
}

export async function handleAnnouncementRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const match = ITEM.exec(pathname);
  if (pathname !== ROOT && !match) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer) return json({ error: "ログインが必要です" }, 401);
  if (pathname === ROOT) return request.method === "GET" ? list(env.DB) : json({ error: "method_not_allowed" }, 405);
  if (!isAdmin(viewer)) return json({ error: "管理者権限が必要です" }, 403);
  const id = decodeURIComponent(match![1]);
  if (!id || id.length > 128) return json({ error: "お知らせIDを確認してください" }, 400);
  if (request.method === "DELETE") {
    await env.DB.prepare("UPDATE announcements SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), id).run();
    return json({ success: true });
  }
  if (request.method !== "PUT" && request.method !== "PATCH") return json({ error: "method_not_allowed" }, 405);
  const value = await readBody(request);
  const announcement = value && input(value);
  if (!announcement) return json({ error: "タイトルと本文を入力してください" }, 400);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO announcements (id, title, content, created_by_member_id, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, updated_at = excluded.updated_at, deleted_at = NULL`)
    .bind(id, announcement.title, announcement.content, viewer.id, now, now).run();
  return json({ success: true });
}
