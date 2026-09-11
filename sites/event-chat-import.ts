import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const PATH = "/api/admin/event-chat-import/commit";
const MAX_BODY = 1024 * 1024;
type Viewer = NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const admin = (member: Viewer) => member.role === "admin" || member.access_role === "admin";

export async function handleEventChatImportRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== PATH) return null;
  if (request.method !== "POST") return json({ error: "許可されていない操作です" }, 405);
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer || !admin(viewer)) return json({ error: "管理者権限が必要です" }, 403);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return json({ error: "ファイルが大きすぎます" }, 413);
  let payload: { confirmation?: unknown; chats?: unknown[] };
  try { payload = JSON.parse(raw) as typeof payload; } catch { return json({ error: "JSON形式を確認してください" }, 400); }
  if (!Array.isArray(payload.chats) || payload.confirmation !== `APPLY_${payload.chats.length}_EVENT_CHATS`) return json({ error: "確認コードが一致しません" }, 400);
  const authorRows = await env.DB.prepare("SELECT id, discord_user_id FROM members WHERE discord_user_id IS NOT NULL").all<{ id: number; discord_user_id: string }>();
  const authors = new Map((authorRows.results ?? []).map((row) => [row.discord_user_id, row.id]));
  let rooms = 0, messages = 0, held = 0;
  for (const source of payload.chats) {
    if (!source || typeof source !== "object") { held += 1; continue; }
    const chat = source as Record<string, unknown>;
    const eventId = typeof chat.eventId === "string" && /^discord-event-\d{10,30}$/.test(chat.eventId) ? chat.eventId : null;
    const sourceChannelId = typeof chat.sourceChannelId === "string" && /^\d{10,30}$/.test(chat.sourceChannelId) ? chat.sourceChannelId : null;
    if (!eventId || !sourceChannelId || !Array.isArray(chat.messages)) { held += 1; continue; }
    const event = await env.DB.prepare("SELECT id, title, organizer_member_id FROM events WHERE id = ? LIMIT 1").bind(eventId).first<{ id: string; title: string; organizer_member_id: number }>();
    if (!event) { held += 1; continue; }
    const roomId = `event_chat_${event.id}`;
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO chat_rooms (id, name, room_type, source_id, created_by_member_id, created_at, updated_at) VALUES (?, ?, 'event', ?, ?, ?, ?)").bind(roomId, event.title, event.id, event.organizer_member_id, now, now),
      env.DB.prepare("INSERT OR IGNORE INTO chat_room_members (room_id, member_id, member_role, joined_at) VALUES (?, ?, 'owner', ?)").bind(roomId, event.organizer_member_id, now),
    ]);
    rooms += 1;
    const statements = [];
    for (const item of chat.messages) {
      if (!item || typeof item !== "object") { held += 1; continue; }
      const message = item as Record<string, unknown>;
      const id = typeof message.sourceMessageId === "string" && /^\d{10,30}$/.test(message.sourceMessageId) ? `discord-chat-${message.sourceMessageId}` : null;
      const author = typeof message.authorDiscordUserId === "string" ? authors.get(message.authorDiscordUserId) : undefined;
      const content = typeof message.content === "string" ? message.content.slice(0, 10_000) : "";
      const createdAt = typeof message.createdAt === "string" && !Number.isNaN(Date.parse(message.createdAt)) ? message.createdAt : now;
      const images = Array.isArray(message.imageUrls) ? message.imageUrls.filter((value): value is string => typeof value === "string" && /^https:\/\//.test(value)).slice(0, 10) : [];
      if (!id || !author || (!content && !images.length)) { held += 1; continue; }
      const body = images.length > 1 ? `${content}${content ? "\n" : ""}${images.slice(1).join("\n")}` : content;
      statements.push(
        env.DB.prepare("INSERT OR IGNORE INTO chat_room_members (room_id, member_id, member_role, joined_at) VALUES (?, ?, 'member', ?)").bind(roomId, author, createdAt),
        env.DB.prepare("INSERT OR IGNORE INTO chat_messages (id, room_id, sender_member_id, content, image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, roomId, author, body, images[0] ?? null, createdAt, createdAt),
      );
      messages += 1;
    }
    for (let index = 0; index < statements.length; index += 80) await env.DB.batch(statements.slice(index, index + 80));
    await env.DB.prepare("UPDATE chat_rooms SET updated_at = ? WHERE id = ?").bind(now, roomId).run();
  }
  return json({ rooms, messages, held });
}
