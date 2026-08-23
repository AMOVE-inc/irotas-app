import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const NOTIFICATIONS_PATH = "/api/notifications";
const READ_ALL_PATH = "/api/notifications/read-all";
const NOTIFICATION_PATH = /^\/api\/notifications\/([^/]+)$/;

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  club_id: string | null;
  event_id: string | null;
  chat_room_id: string | null;
  read_at: string | null;
  created_at: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function serialize(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    clubId: row.club_id,
    eventId: row.event_id,
    chatRoomId: row.chat_room_id,
    read: Boolean(row.read_at),
    createdAt: row.created_at,
  };
}

export async function handleNotificationRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const notificationMatch = NOTIFICATION_PATH.exec(pathname);
  if (pathname !== NOTIFICATIONS_PATH && pathname !== READ_ALL_PATH && !notificationMatch) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);

  if (pathname === NOTIFICATIONS_PATH && request.method === "GET") {
    const rows = await env.DB.prepare(`SELECT id, type, title, body, club_id, event_id, chat_room_id, read_at, created_at
      FROM in_app_notifications WHERE target_member_id = ?
      ORDER BY created_at DESC LIMIT 100`).bind(member.id).all<NotificationRow>();
    return json({ notifications: (rows.results ?? []).map(serialize) });
  }

  if (pathname === READ_ALL_PATH && request.method === "PATCH") {
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE in_app_notifications SET read_at = ?
      WHERE target_member_id = ? AND read_at IS NULL`).bind(now, member.id).run();
    return json({ success: true, readAt: now });
  }

  if (notificationMatch && request.method === "PATCH") {
    const id = decodeURIComponent(notificationMatch[1]);
    const now = new Date().toISOString();
    const row = await env.DB.prepare(`SELECT id, type, title, body, club_id, event_id, chat_room_id,
        COALESCE(read_at, ?) AS read_at, created_at
      FROM in_app_notifications WHERE id = ? AND target_member_id = ? LIMIT 1`)
      .bind(now, id, member.id).first<NotificationRow>();
    if (!row) return json({ error: "通知が見つかりません" }, 404);
    await env.DB.prepare(`UPDATE in_app_notifications SET read_at = COALESCE(read_at, ?)
      WHERE id = ? AND target_member_id = ?`).bind(now, id, member.id).run();
    return json({ notification: serialize(row) });
  }

  return json({ error: "method_not_allowed" }, 405);
}
