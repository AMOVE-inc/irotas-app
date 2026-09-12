import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const PATH = "/api/admin/event-chat-import/commit";
const PURGE_PATH = "/api/admin/event-chat-import/purge";
type Viewer = NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const admin = (member: Viewer) => member.role === "admin" || member.access_role === "admin";

export async function handleEventChatImportRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== PATH) return null;
  if (request.method !== "POST") return json({ error: "許可されていない操作です" }, 405);
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer || !admin(viewer)) return json({ error: "管理者権限が必要です" }, 403);
  return json({ error: "Discordから移行したイベントのチャット取込は終了しました" }, 410);
}

/**
 * Removes only chat content that was imported from Discord. Event records,
 * applications, attendees, and any messages created in IRO+ are deliberately
 * outside this operation. Soft deletion keeps the operation recoverable.
 */
export async function handleEventChatImportPurgeRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== PURGE_PATH) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer || !admin(viewer)) return json({ error: "管理者権限が必要です" }, 403);

  const importedRows = await env.DB.prepare(`
    SELECT DISTINCT cm.room_id AS id
    FROM chat_messages cm
    JOIN chat_rooms cr ON cr.id = cm.room_id
    WHERE cm.id LIKE 'discord-chat-%'
      AND cm.deleted_at IS NULL
      AND cr.room_type = 'event'
      AND cr.deleted_at IS NULL
  `).all<{ id: string }>();
  const roomIds = (importedRows.results ?? []).map((row) => row.id);
  const countRow = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM chat_messages cm
    JOIN chat_rooms cr ON cr.id = cm.room_id
    WHERE cm.id LIKE 'discord-chat-%'
      AND cm.deleted_at IS NULL
      AND cr.room_type = 'event'
      AND cr.deleted_at IS NULL
  `).first<{ count: number }>();
  const messages = Number(countRow?.count ?? 0);

  if (request.method === "GET") return json({ messages, rooms: roomIds.length });
  if (request.method !== "POST") return json({ error: "許可されていない操作です" }, 405);

  let payload: { confirmation?: unknown };
  try { payload = await request.json() as typeof payload; } catch { return json({ error: "JSON形式を確認してください" }, 400); }
  if (payload.confirmation !== `DELETE_${messages}_IMPORTED_EVENT_CHAT_MESSAGES`) {
    return json({ error: "確認コードが一致しません" }, 400);
  }
  if (!messages) return json({ deletedMessages: 0, deletedRooms: 0, retainedRooms: 0 });

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE chat_messages
    SET deleted_at = ?, updated_at = ?
    WHERE id LIKE 'discord-chat-%'
      AND deleted_at IS NULL
      AND room_id IN (SELECT id FROM chat_rooms WHERE room_type = 'event' AND deleted_at IS NULL)
  `).bind(now, now).run();

  let deletedRooms = 0;
  for (const roomId of roomIds) {
    const result = await env.DB.prepare(`
      UPDATE chat_rooms
      SET deleted_at = ?, updated_at = ?
      WHERE id = ?
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM chat_messages
          WHERE room_id = ? AND deleted_at IS NULL
        )
    `).bind(now, now, roomId, roomId).run();
    deletedRooms += Number(result.meta?.changes ?? 0);
  }

  return json({
    deletedMessages: messages,
    deletedRooms,
    retainedRooms: roomIds.length - deletedRooms,
  });
}
