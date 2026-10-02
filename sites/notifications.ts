import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const NOTIFICATIONS_PATH = "/api/notifications";
const READ_ALL_PATH = "/api/notifications/read-all";
const PUSH_TOKEN_PATH = "/api/notifications/push-token";
const PREFERENCES_PATH = "/api/notifications/preferences";
const NOTIFICATION_PATH = /^\/api\/notifications\/([^/]+)$/;

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  club_id: string | null;
  event_id: string | null;
  chat_room_id: string | null;
  target_path: string | null;
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
    targetPath: row.target_path,
    read: Boolean(row.read_at),
    createdAt: row.created_at,
  };
}

export async function handleNotificationRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const notificationMatch = NOTIFICATION_PATH.exec(pathname);
  if (pathname !== NOTIFICATIONS_PATH && pathname !== READ_ALL_PATH && pathname !== PUSH_TOKEN_PATH && pathname !== PREFERENCES_PATH && !notificationMatch) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);

  if (pathname === NOTIFICATIONS_PATH && request.method === "GET") {
    const rows = await env.DB.prepare(`SELECT id, type, title, body, club_id, event_id, chat_room_id, target_path, read_at, created_at
      FROM in_app_notifications WHERE target_member_id = ? AND type != 'system_error'
        AND julianday(created_at) > julianday((SELECT COALESCE(password_set_at, last_signed_in_at) FROM members WHERE id = ?))
      ORDER BY created_at DESC LIMIT 100`).bind(member.id, member.id).all<NotificationRow>();
    const seenConfirmations = new Set<string>();
    const notifications = (rows.results ?? []).map(serialize).filter((notification) => {
      if (notification.type !== "event_confirmed" || !notification.eventId) return true;
      const key = `${notification.type}:${notification.eventId}`;
      if (seenConfirmations.has(key)) return false;
      seenConfirmations.add(key);
      return true;
    });
    return json({ notifications });
  }

  if (pathname === PUSH_TOKEN_PATH && (request.method === "POST" || request.method === "DELETE")) {
    const input = await request.json().catch(() => null) as { token?: unknown; platform?: unknown; preferences?: unknown } | null;
    const token = typeof input?.token === "string" && /^ExponentPushToken\[[\w-]+\]$/.test(input.token) ? input.token : null;
    if (!token) return json({ error: "Push Tokenが不正です" }, 400);
    const now = new Date().toISOString();
    if (request.method === "DELETE") {
      await env.DB.prepare("UPDATE member_push_tokens SET disabled_at=?,updated_at=? WHERE token=? AND member_id=?").bind(now, now, token, member.id).run();
      return json({ success: true });
    }
    const platform = input?.platform === "ios" || input?.platform === "android" ? input.platform : null;
    if (!platform) return json({ error: "端末情報が不正です" }, 400);
    const preferences = input?.preferences && typeof input.preferences === "object" && !Array.isArray(input.preferences) ? input.preferences : {};
    await env.DB.prepare(`INSERT INTO member_push_tokens
      (token,member_id,platform,preferences_json,last_seen_at,disabled_at,created_at,updated_at)
      VALUES (?,?,?,?,?,NULL,?,?)
      ON CONFLICT(token) DO UPDATE SET member_id=excluded.member_id,platform=excluded.platform,
        preferences_json=excluded.preferences_json,last_seen_at=excluded.last_seen_at,disabled_at=NULL,updated_at=excluded.updated_at`)
      .bind(token, member.id, platform, JSON.stringify(preferences), now, now, now).run();
    return json({ success: true });
  }

  if (pathname === PREFERENCES_PATH && request.method === "PUT") {
    const input = await request.json().catch(() => null) as { preferences?: unknown } | null;
    if (!input?.preferences || typeof input.preferences !== "object" || Array.isArray(input.preferences)) return json({ error: "通知設定が不正です" }, 400);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE member_push_tokens SET preferences_json=?,updated_at=? WHERE member_id=? AND disabled_at IS NULL")
      .bind(JSON.stringify(input.preferences), now, member.id).run();
    return json({ success: true });
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
    const row = await env.DB.prepare(`SELECT id, type, title, body, club_id, event_id, chat_room_id, target_path,
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
