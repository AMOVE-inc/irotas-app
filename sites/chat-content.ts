import { authenticatedRequestMember } from "./auth";
import { canMemberAccessClub } from "./clubs";
import type { D1Database, SitesEnv } from "./platform-types";

const MESSAGES_PATH = /^\/api\/chats\/([^/]+)\/messages$/;
const ROOMS_PATH = "/api/chats";
const ROOM_PATH = /^\/api\/chats\/([^/]+)$/;
const MEMBERS_PATH = /^\/api\/chats\/([^/]+)\/members$/;
const MEMBER_PATH = /^\/api\/chats\/([^/]+)\/members\/([^/]+)$/;
const READ_PATH = /^\/api\/chats\/([^/]+)\/read$/;
const REACTIONS_PATH = "/api/chats/reactions";
const MESSAGE_PATH = /^\/api\/chats\/messages\/([^/]+)$/;
const MAX_BODY_BYTES = 64 * 1024;

type Viewer = NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>;
type RoomRow = {
  id: string;
  name: string;
  room_type: "announcement" | "event" | "club" | "rank" | "board" | "dm" | "group";
  source_id: string | null;
  required_rank: string | null;
  created_by_member_id: number | null;
};
type MessageRow = {
  id: string;
  room_id: string;
  sender_member_id: number;
  sender_public_member_id: string | null;
  sender_display_name: string | null;
  sender_profile_json: string | null;
  content: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};
type ReactionRow = {
  message_id: string;
  emoji: string;
  member_id: number;
  public_member_id: string | null;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" },
  });
}

async function readBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function elevated(member: Viewer) {
  return member.role === "admin" || member.access_role === "admin" || member.access_role === "operator";
}

function administrator(member: Viewer) {
  return member.role === "admin" || member.access_role === "admin";
}

function validRoomId(value: string) {
  return value.length <= 160 && /^[a-zA-Z0-9_-]+$/.test(value);
}

function validImageUrl(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 1000) return null;
  const image = value.trim();
  return image.startsWith("/api/event-images/") || /^https:\/\//i.test(image) ? image : null;
}

async function roomById(db: D1Database, roomId: string) {
  return db.prepare(`SELECT id, name, room_type, source_id, required_rank, created_by_member_id
    FROM chat_rooms WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(roomId).first<RoomRow>();
}

async function mutualFriends(db: D1Database, memberId: number, targetId: number) {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM member_follows
    WHERE (follower_member_id = ? AND followed_member_id = ?)
       OR (follower_member_id = ? AND followed_member_id = ?)`).bind(memberId, targetId, targetId, memberId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0) === 2;
}

async function ensureEventRoom(db: D1Database, roomId: string) {
  const event = await db.prepare(`SELECT id, title, organizer_member_id, public_data_json
    FROM events
    WHERE json_extract(public_data_json, '$.chatId') = ?
    LIMIT 1`).bind(roomId).first<{ id: string; title: string; organizer_member_id: number; public_data_json: string }>();
  if (!event) return null;
  const now = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO chat_rooms
    (id, name, room_type, source_id, created_by_member_id, created_at, updated_at)
    VALUES (?, ?, 'event', ?, ?, ?, ?)`).bind(
      roomId, event.title, event.id, event.organizer_member_id, now, now,
    ).run();
  await db.prepare(`INSERT OR IGNORE INTO chat_room_members
    (room_id, member_id, member_role, joined_at)
    VALUES (?, ?, 'owner', ?)`).bind(roomId, event.organizer_member_id, now).run();
  const confirmed = await db.prepare(`SELECT member_id FROM event_participations
    WHERE event_id = ? AND status IN ('confirmed', 'cancel_requested')`)
    .bind(event.id).all<{ member_id: number }>();
  if (confirmed.results?.length) {
    await db.batch(confirmed.results.map((item) => db.prepare(`INSERT INTO chat_room_members
      (room_id, member_id, member_role, joined_at, left_at)
      VALUES (?, ?, 'member', ?, NULL)
      ON CONFLICT(room_id, member_id) DO UPDATE SET left_at = NULL`)
      .bind(roomId, item.member_id, now)));
  }
  let data: { companionIds?: unknown } = {};
  try { data = JSON.parse(event.public_data_json) as { companionIds?: unknown }; } catch {}
  const companionIds = Array.isArray(data.companionIds)
    ? data.companionIds.filter((value): value is string => typeof value === "string")
    : [];
  for (const companionId of companionIds) {
    const companion = await memberByPublicId(db, companionId);
    if (!companion || companion.id === event.organizer_member_id) continue;
    await db.prepare(`INSERT INTO chat_room_members
      (room_id, member_id, member_role, joined_at, left_at)
      VALUES (?, ?, 'member', ?, NULL)
      ON CONFLICT(room_id, member_id) DO UPDATE SET left_at = NULL`)
      .bind(roomId, companion.id, now).run();
  }
  return roomById(db, roomId);
}

async function ensureKnownRoom(db: D1Database, roomId: string) {
  const existing = await roomById(db, roomId);
  if (existing) return existing;
  if (roomId.startsWith("event_chat_")) return ensureEventRoom(db, roomId);
  return null;
}

async function viewerRank(db: D1Database, memberId: number) {
  const row = await db.prepare("SELECT member_rank FROM members WHERE id = ? LIMIT 1")
    .bind(memberId).first<{ member_rank: string | null }>();
  return row?.member_rank ?? "regular";
}

async function canAccessRoom(db: D1Database, room: RoomRow, member: Viewer) {
  // 個人間DMは運営・管理者であっても当事者以外は閲覧できない。
  if (room.room_type === "dm") {
    const membership = await db.prepare(`SELECT 1 AS allowed FROM chat_room_members
      WHERE room_id = ? AND member_id = ? AND left_at IS NULL LIMIT 1`)
      .bind(room.id, member.id).first<{ allowed: number }>();
    return Boolean(membership);
  }
  if (elevated(member)) return true;
  if (room.room_type === "announcement") return true;
  if (room.room_type === "rank")
    return !elevated(member) && (await viewerRank(db, member.id)) === room.required_rank;
  if (room.room_type === "club" && room.source_id)
    return canMemberAccessClub(db, room.source_id, member.id, elevated(member));
  if (room.room_type === "event" && room.source_id) {
    const event = await db.prepare(`SELECT event_type, club_id, organizer_member_id
      FROM events WHERE id = ? LIMIT 1`).bind(room.source_id)
      .first<{ event_type: string; club_id: string | null; organizer_member_id: number }>();
    if (!event) return false;
    const admin = member.role === "admin" || member.access_role === "admin";
    if (event.event_type === "club" && event.club_id &&
      !await canMemberAccessClub(db, event.club_id, member.id, admin)) return false;
    if (event.organizer_member_id === member.id || elevated(member)) return true;
    const chatMembership = await db.prepare(`SELECT 1 AS allowed FROM chat_room_members
      WHERE room_id = ? AND member_id = ? AND left_at IS NULL LIMIT 1`)
      .bind(room.id, member.id).first<{ allowed: number }>();
    if (chatMembership) return true;
    const participation = await db.prepare(`SELECT 1 AS allowed FROM event_participations
      WHERE event_id = ? AND member_id = ? AND status IN ('confirmed', 'cancel_requested') LIMIT 1`)
      .bind(room.source_id, member.id).first<{ allowed: number }>();
    return Boolean(participation);
  }
  // 運営メンバーは問い合わせ・安全対応のため全チャットを閲覧できる。
  const membership = await db.prepare(`SELECT 1 AS allowed FROM chat_room_members
    WHERE room_id = ? AND member_id = ? AND left_at IS NULL LIMIT 1`)
    .bind(room.id, member.id).first<{ allowed: number }>();
  return Boolean(membership);
}

async function memberByPublicId(db: D1Database, memberId: string) {
  const numericId = /^member-(\d+)$/.exec(memberId)?.[1] ?? null;
  return db.prepare(`SELECT id, public_member_id, display_name
    FROM members WHERE account_status = 'active'
      AND (public_member_id = ? OR id = ?) LIMIT 1`)
    .bind(memberId, numericId).first<{ id: number; public_member_id: string | null; display_name: string }>();
}

async function canManageRoom(db: D1Database, room: RoomRow, member: Viewer) {
  if (administrator(member)) return true;
  if (room.created_by_member_id === member.id) return true;
  const membership = await db.prepare(`SELECT member_role FROM chat_room_members
    WHERE room_id = ? AND member_id = ? AND left_at IS NULL LIMIT 1`)
    .bind(room.id, member.id).first<{ member_role: string }>();
  return membership?.member_role === "owner";
}

function mutableRoom(room: RoomRow) {
  return room.room_type === "dm" || room.room_type === "group" || room.room_type === "board";
}

function canPost(room: RoomRow, member: Viewer) {
  return room.room_type !== "announcement" || elevated(member);
}

function publicMemberId(memberId: number, value: string | null) {
  return value ?? `member-${memberId}`;
}

function reactionsFor(messageId: string, rows: ReactionRow[]) {
  return rows.filter((item) => item.message_id === messageId)
    .reduce<Record<string, string[]>>((result, item) => {
      (result[item.emoji] ??= []).push(publicMemberId(item.member_id, item.public_member_id));
      return result;
    }, {});
}

function serializeMessage(row: MessageRow, reactions: ReactionRow[]) {
  let senderAvatar: string | undefined;
  try {
    const profile = JSON.parse(row.sender_profile_json ?? "{}") as { avatarUrl?: unknown };
    if (typeof profile.avatarUrl === "string" && profile.avatarUrl.trim()) senderAvatar = profile.avatarUrl;
  } catch {}
  return {
    id: row.id,
    chatId: row.room_id,
    senderId: publicMemberId(row.sender_member_id, row.sender_public_member_id),
    externalAuthorName: row.sender_display_name?.trim() || "メンバー",
    senderAvatar,
    content: row.content,
    imageUri: row.image_url || undefined,
    reactions: reactionsFor(row.id, reactions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shared: true,
  };
}

async function messageRows(db: D1Database, roomId: string) {
  const result = await db.prepare(`SELECT cm.id, cm.room_id, cm.sender_member_id,
      m.public_member_id AS sender_public_member_id, m.display_name AS sender_display_name, m.profile_json AS sender_profile_json,
      cm.content, cm.image_url, cm.created_at, cm.updated_at
    FROM chat_messages cm JOIN members m ON m.id = cm.sender_member_id
    WHERE cm.room_id = ? AND cm.deleted_at IS NULL
    ORDER BY cm.created_at ASC LIMIT 500`).bind(roomId).all<MessageRow>();
  return result.results ?? [];
}

async function reactionRows(db: D1Database, messageIds: string[]) {
  if (!messageIds.length) return [];
  const placeholders = messageIds.map(() => "?").join(",");
  const result = await db.prepare(`SELECT cr.message_id, cr.emoji, cr.member_id, m.public_member_id
    FROM chat_message_reactions cr JOIN members m ON m.id = cr.member_id
    WHERE cr.message_id IN (${placeholders})`).bind(...messageIds).all<ReactionRow>();
  return result.results ?? [];
}

async function audit(db: D1Database, actorId: number, action: string, entityId: string) {
  await db.prepare(`INSERT INTO audit_logs
    (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
    VALUES (?, ?, 'chat_message', ?, '{}', ?)`).bind(
      String(actorId), action, entityId, new Date().toISOString(),
    ).run();
}

async function ensureViewerEventRooms(db: D1Database, member: Viewer) {
  const result = await db.prepare(`SELECT id, title, organizer_member_id,
      json_extract(public_data_json, '$.chatId') AS chat_id
    FROM events
    WHERE status != 'cancelled' AND json_extract(public_data_json, '$.chatId') IS NOT NULL
    ORDER BY event_date DESC LIMIT 100`).all<{
      id: string; title: string; organizer_member_id: number; chat_id: string;
    }>();
  for (const event of result.results ?? []) {
    if (!event.chat_id || !validRoomId(event.chat_id)) continue;
    await ensureEventRoom(db, event.chat_id);
  }
}

async function serializeRoom(db: D1Database, room: RoomRow, member: Viewer) {
  const participantResult = await db.prepare(`SELECT crm.member_id, m.public_member_id, m.display_name
    FROM chat_room_members crm JOIN members m ON m.id = crm.member_id
    WHERE crm.room_id = ? AND crm.left_at IS NULL ORDER BY crm.joined_at`)
    .bind(room.id).all<{ member_id: number; public_member_id: string | null; display_name: string }>();
  const last = await db.prepare(`SELECT content, image_url, created_at FROM chat_messages
    WHERE room_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`)
    .bind(room.id).first<{ content: string; image_url: string | null; created_at: string }>();
  const viewerDisplayName = (participantResult.results ?? []).find((item) => item.member_id === member.id)?.display_name ?? "";
  const unread = await db.prepare(`SELECT COUNT(*) AS count FROM chat_messages cm
    LEFT JOIN chat_room_reads crr ON crr.room_id = cm.room_id AND crr.member_id = ?
    WHERE cm.room_id = ? AND cm.deleted_at IS NULL AND cm.sender_member_id != ?
      AND (crr.last_read_at IS NULL OR cm.created_at > crr.last_read_at)`)
    .bind(member.id, room.id, member.id).first<{ count: number }>();
  const mentions = await db.prepare(`SELECT COUNT(*) AS count FROM chat_messages cm
    LEFT JOIN chat_room_reads crr ON crr.room_id = cm.room_id AND crr.member_id = ?
    WHERE cm.room_id = ? AND cm.deleted_at IS NULL AND cm.sender_member_id != ?
      AND (crr.last_read_at IS NULL OR cm.created_at > crr.last_read_at)
      AND (cm.content LIKE ? OR cm.content LIKE '%@全員%' OR cm.content LIKE '%@everyone%' OR cm.content LIKE '%@here%')`)
    .bind(member.id, room.id, member.id, `%@${viewerDisplayName}%`).first<{ count: number }>();
  const creator = room.created_by_member_id
    ? await db.prepare("SELECT public_member_id FROM members WHERE id = ? LIMIT 1")
      .bind(room.created_by_member_id).first<{ public_member_id: string | null }>()
    : null;
  const participants = participantResult.results ?? [];
  const dmPartner = room.room_type === "dm"
    ? participants.find((item) => item.member_id !== member.id)
    : null;
  const cancelledEvent = room.room_type === "event" && room.source_id
    ? await db.prepare("SELECT title FROM events WHERE id = ? AND status = 'cancelled' LIMIT 1").bind(room.source_id).first<{ title: string }>()
    : null;
  return {
    id: room.id,
    name: dmPartner?.display_name || (cancelledEvent ? `【開催中止】${cancelledEvent.title}` : room.name),
    type: room.room_type === "announcement" ? "board" : room.room_type,
    sourceId: room.source_id ?? room.id,
    participants: participants.map((item) => publicMemberId(item.member_id, item.public_member_id)),
    createdBy: room.created_by_member_id
      ? publicMemberId(room.created_by_member_id, creator?.public_member_id ?? null)
      : "system",
    requiredRank: room.required_rank ?? undefined,
    lastMessage: last?.content || (last?.image_url ? "画像が送信されました" : ""),
    lastMessageAt: last?.created_at,
    unreadCount: unread?.count ?? 0,
    mentionCount: mentions?.count ?? 0,
    shared: true,
  };
}

export async function handleChatContentRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  const messagesMatch = MESSAGES_PATH.exec(url.pathname);
  const messageMatch = MESSAGE_PATH.exec(url.pathname);
  const readMatch = READ_PATH.exec(url.pathname);
  const membersMatch = MEMBERS_PATH.exec(url.pathname);
  const memberMatch = MEMBER_PATH.exec(url.pathname);
  const roomMatch = ROOM_PATH.exec(url.pathname);
  if (!messagesMatch && !messageMatch && !readMatch && !membersMatch && !memberMatch && !roomMatch &&
      url.pathname !== REACTIONS_PATH && url.pathname !== ROOMS_PATH) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);

  if (url.pathname === ROOMS_PATH && request.method === "GET") {
    await ensureViewerEventRooms(env.DB, member);
    const result = await env.DB.prepare(`SELECT id, name, room_type, source_id, required_rank, created_by_member_id
      FROM chat_rooms WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200`).all<RoomRow>();
    const visible: RoomRow[] = [];
    for (const room of result.results ?? []) {
      if (await canAccessRoom(env.DB, room, member)) visible.push(room);
    }
    return json({ rooms: await Promise.all(visible.map((room) => serializeRoom(env.DB!, room, member))) });
  }

  if (url.pathname === ROOMS_PATH && request.method === "POST") {
    const input = await readBody(request);
    const type = input?.type;
    if (!input || (type !== "dm" && type !== "group"))
      return json({ error: "チャット種別が不正です" }, 400);
    const rawMemberIds = Array.isArray(input.memberIds)
      ? input.memberIds.filter((item): item is string => typeof item === "string")
      : [];
    const uniqueMemberIds = [...new Set(rawMemberIds)].slice(0, 99);
    const targets = [] as { id: number; public_member_id: string | null; display_name: string }[];
    for (const publicId of uniqueMemberIds) {
      const target = await memberByPublicId(env.DB, publicId);
      if (!target || target.id === member.id) continue;
      targets.push(target);
    }
    if (type === "dm" && targets.length !== 1)
      return json({ error: "DMの相手を1人指定してください" }, 400);
    if (type === "group" && targets.length < 2)
      return json({ error: "グループには2人以上招待してください" }, 400);
    if (type === "group") {
      for (const target of targets) {
        if (!await mutualFriends(env.DB, member.id, target.id))
          return json({ error: "グループには相互フォローの友達だけを招待できます" }, 403);
      }
    }

    if (type === "dm") {
      const pair = [member.id, targets[0].id].sort((a, b) => a - b).join(":");
      const existing = await env.DB.prepare(`SELECT id, name, room_type, source_id, required_rank, created_by_member_id
        FROM chat_rooms WHERE room_type = 'dm' AND source_id = ? AND deleted_at IS NULL LIMIT 1`)
        .bind(pair).first<RoomRow>();
      if (existing) {
        const now = new Date().toISOString();
        await env.DB.batch([member.id, targets[0].id].map((memberId) => env.DB!.prepare(`INSERT INTO chat_room_members
          (room_id, member_id, member_role, joined_at, left_at) VALUES (?, ?, 'member', ?, NULL)
          ON CONFLICT(room_id, member_id) DO UPDATE SET left_at = NULL`)
          .bind(existing.id, memberId, now)));
        return json({ room: await serializeRoom(env.DB, existing, member) });
      }
    }

    const name = type === "dm"
      ? targets[0].display_name
      : (typeof input.name === "string" ? input.name.normalize("NFKC").trim() : "");
    if (!name || name.length > 100) return json({ error: "チャット名は100文字以内で入力してください" }, 400);
    const now = new Date().toISOString();
    const roomId = `${type}_${crypto.randomUUID().replaceAll("-", "")}`;
    const sourceId = type === "dm"
      ? [member.id, targets[0].id].sort((a, b) => a - b).join(":")
      : roomId;
    await env.DB.prepare(`INSERT INTO chat_rooms
      (id, name, room_type, source_id, created_by_member_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(roomId, name, type, sourceId, member.id, now, now).run();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO chat_room_members
        (room_id, member_id, member_role, joined_at) VALUES (?, ?, 'owner', ?)`)
        .bind(roomId, member.id, now),
      ...targets.map((target) => env.DB!.prepare(`INSERT INTO chat_room_members
        (room_id, member_id, member_role, joined_at) VALUES (?, ?, 'member', ?)`)
        .bind(roomId, target.id, now)),
    ]);
    const room = await roomById(env.DB, roomId);
    return json({ room: room ? await serializeRoom(env.DB, room, member) : null }, 201);
  }

  if (roomMatch && url.pathname !== REACTIONS_PATH && !messagesMatch && !readMatch && !membersMatch && !memberMatch) {
    const roomId = decodeURIComponent(roomMatch[1]);
    const room = validRoomId(roomId) ? await ensureKnownRoom(env.DB, roomId) : null;
    if (!room) return json({ error: "チャットが見つかりません" }, 404);
    if (!await canAccessRoom(env.DB, room, member))
      return json({ error: "このチャットを閲覧する権限がありません" }, 403);
    if (request.method === "PATCH") {
      if (!mutableRoom(room) || room.room_type === "dm" || !await canManageRoom(env.DB, room, member))
        return json({ error: "チャット名を変更する権限がありません" }, 403);
      const input = await readBody(request);
      const name = typeof input?.name === "string" ? input.name.normalize("NFKC").trim() : "";
      if (!name || name.length > 100) return json({ error: "チャット名は100文字以内で入力してください" }, 400);
      await env.DB.prepare("UPDATE chat_rooms SET name = ?, updated_at = ? WHERE id = ?")
        .bind(name, new Date().toISOString(), roomId).run();
      const updated = await roomById(env.DB, roomId);
      return json({ room: updated ? await serializeRoom(env.DB, updated, member) : null });
    }
    if (request.method === "DELETE") {
      if (!mutableRoom(room) || !await canManageRoom(env.DB, room, member))
        return json({ error: "チャットを削除する権限がありません" }, 403);
      await env.DB.prepare("UPDATE chat_rooms SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), new Date().toISOString(), roomId).run();
      return json({ success: true });
    }
  }

  if (membersMatch && request.method === "POST") {
    const roomId = decodeURIComponent(membersMatch[1]);
    const room = validRoomId(roomId) ? await ensureKnownRoom(env.DB, roomId) : null;
    if (!room) return json({ error: "チャットが見つかりません" }, 404);
    if ((room.room_type !== "group" && room.room_type !== "board") || !await canManageRoom(env.DB, room, member))
      return json({ error: "メンバーを招待する権限がありません" }, 403);
    const input = await readBody(request);
    const target = typeof input?.memberId === "string" ? await memberByPublicId(env.DB, input.memberId) : null;
    if (!target) return json({ error: "メンバーが見つかりません" }, 404);
    if (room.room_type === "group" && !await mutualFriends(env.DB, member.id, target.id))
      return json({ error: "グループには相互フォローの友達だけを招待できます" }, 403);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO chat_room_members
      (room_id, member_id, member_role, joined_at, left_at) VALUES (?, ?, 'member', ?, NULL)
      ON CONFLICT(room_id, member_id) DO UPDATE SET left_at = NULL, joined_at = excluded.joined_at`)
      .bind(roomId, target.id, now).run();
    await env.DB.prepare("UPDATE chat_rooms SET updated_at = ? WHERE id = ?").bind(now, roomId).run();
    const updated = await roomById(env.DB, roomId);
    return json({ room: updated ? await serializeRoom(env.DB, updated, member) : null });
  }

  if (memberMatch && request.method === "DELETE") {
    const roomId = decodeURIComponent(memberMatch[1]);
    const targetPublicId = decodeURIComponent(memberMatch[2]);
    const room = validRoomId(roomId) ? await ensureKnownRoom(env.DB, roomId) : null;
    if (!room) return json({ error: "チャットが見つかりません" }, 404);
    if (!mutableRoom(room)) return json({ error: "このチャットからは退出できません" }, 403);
    const target = await memberByPublicId(env.DB, targetPublicId);
    if (!target) return json({ error: "メンバーが見つかりません" }, 404);
    const removingSelf = target.id === member.id;
    if (!removingSelf && !await canManageRoom(env.DB, room, member))
      return json({ error: "メンバーを削除する権限がありません" }, 403);
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE chat_room_members SET left_at = ?
      WHERE room_id = ? AND member_id = ?`).bind(now, roomId, target.id).run();
    if (target.id === room.created_by_member_id) {
      const successor = await env.DB.prepare(`SELECT member_id FROM chat_room_members
        WHERE room_id = ? AND left_at IS NULL ORDER BY joined_at LIMIT 1`)
        .bind(roomId).first<{ member_id: number }>();
      if (successor) {
        await env.DB.batch([
          env.DB.prepare("UPDATE chat_room_members SET member_role = 'owner' WHERE room_id = ? AND member_id = ?")
            .bind(roomId, successor.member_id),
          env.DB.prepare("UPDATE chat_rooms SET created_by_member_id = ?, updated_at = ? WHERE id = ?")
            .bind(successor.member_id, now, roomId),
        ]);
      } else {
        await env.DB.prepare("UPDATE chat_rooms SET deleted_at = ?, updated_at = ? WHERE id = ?")
          .bind(now, now, roomId).run();
      }
    }
    return json({ success: true });
  }

  if (readMatch && request.method === "PUT") {
    const roomId = decodeURIComponent(readMatch[1]);
    const room = validRoomId(roomId) ? await ensureKnownRoom(env.DB, roomId) : null;
    if (!room) return json({ error: "チャットが見つかりません" }, 404);
    if (!await canAccessRoom(env.DB, room, member))
      return json({ error: "このチャットを閲覧する権限がありません" }, 403);
    await env.DB.prepare(`INSERT INTO chat_room_reads (room_id, member_id, last_read_at)
      VALUES (?, ?, ?) ON CONFLICT(room_id, member_id) DO UPDATE SET last_read_at = excluded.last_read_at`)
      .bind(roomId, member.id, new Date().toISOString()).run();
    return json({ success: true });
  }

  if (messagesMatch) {
    const roomId = decodeURIComponent(messagesMatch[1]);
    if (!validRoomId(roomId)) return json({ error: "チャットIDが不正です" }, 400);
    const room = await ensureKnownRoom(env.DB, roomId);
    if (!room) return json({ error: "チャットが見つかりません" }, 404);
    if (!await canAccessRoom(env.DB, room, member))
      return json({ error: "このチャットを閲覧する権限がありません" }, 403);

    if (request.method === "GET") {
      const messages = await messageRows(env.DB, roomId);
      const reactions = await reactionRows(env.DB, messages.map((item) => item.id));
      return json({ messages: messages.map((item) => serializeMessage(item, reactions)) });
    }

    if (request.method === "POST") {
      if (!canPost(room, member)) return json({ error: "運営メンバーのみ送信できます" }, 403);
      const input = await readBody(request);
      const content = typeof input?.content === "string" ? input.content.normalize("NFKC").trim() : "";
      const imageUrl = validImageUrl(input?.imageUrl);
      if (!input || content.length > 10_000 || imageUrl === null || (!content && !imageUrl))
        return json({ error: "メッセージ内容が不正です" }, 400);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(`INSERT INTO chat_messages
        (id, room_id, sender_member_id, content, image_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
          id, roomId, member.id, content, imageUrl || null, now, now,
        ).run();
      await env.DB.prepare("UPDATE chat_rooms SET updated_at = ? WHERE id = ?")
        .bind(now, roomId).run();
      await audit(env.DB, member.id, "chat.message_created", id);
      const rows = await messageRows(env.DB, roomId);
      const created = rows.find((item) => item.id === id);
      return json({ message: created ? serializeMessage(created, []) : null }, 201);
    }
    return json({ error: "対応していない操作です" }, 405);
  }

  if (messageMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    const messageId = decodeURIComponent(messageMatch[1]);
    const existing = await env.DB.prepare(`SELECT id, room_id, sender_member_id
      FROM chat_messages WHERE id = ? AND deleted_at IS NULL LIMIT 1`).bind(messageId)
      .first<{ id: string; room_id: string; sender_member_id: number }>();
    if (!existing) return json({ error: "メッセージが見つかりません" }, 404);
    if (existing.sender_member_id !== member.id) return json({ error: "自分のメッセージのみ操作できます" }, 403);
    const room = await ensureKnownRoom(env.DB, existing.room_id);
    if (!room || !await canAccessRoom(env.DB, room, member)) return json({ error: "このチャットを閲覧する権限がありません" }, 403);
    const now = new Date().toISOString();
    if (request.method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("UPDATE chat_messages SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, messageId),
        env.DB.prepare("UPDATE chat_rooms SET updated_at = ? WHERE id = ?").bind(now, existing.room_id),
      ]);
      await audit(env.DB, member.id, "chat.message_deleted", messageId);
      return json({ success: true });
    }
    const input = await readBody(request);
    const content = typeof input?.content === "string" ? input.content.normalize("NFKC").trim() : "";
    if (!content || content.length > 10_000) return json({ error: "メッセージ内容を確認してください" }, 400);
    await env.DB.batch([
      env.DB.prepare("UPDATE chat_messages SET content = ?, updated_at = ? WHERE id = ?").bind(content, now, messageId),
      env.DB.prepare("UPDATE chat_rooms SET updated_at = ? WHERE id = ?").bind(now, existing.room_id),
    ]);
    await audit(env.DB, member.id, "chat.message_edited", messageId);
    const messages = await messageRows(env.DB, existing.room_id);
    const reactions = await reactionRows(env.DB, [messageId]);
    const updated = messages.find((item) => item.id === messageId);
    return json({ message: updated ? serializeMessage(updated, reactions) : null });
  }

  if (url.pathname === REACTIONS_PATH && (request.method === "PUT" || request.method === "DELETE")) {
    const input = await readBody(request);
    const messageId = typeof input?.messageId === "string" ? input.messageId.trim() : "";
    const emoji = typeof input?.emoji === "string" ? input.emoji.trim() : "";
    if (!messageId || messageId.length > 160 || !emoji || [...emoji].length > 12)
      return json({ error: "リアクションが不正です" }, 400);
    const row = await env.DB.prepare(`SELECT cm.room_id, cr.name, cr.room_type, cr.source_id,
        cr.required_rank, cr.created_by_member_id
      FROM chat_messages cm JOIN chat_rooms cr ON cr.id = cm.room_id
      WHERE cm.id = ? AND cm.deleted_at IS NULL AND cr.deleted_at IS NULL LIMIT 1`)
      .bind(messageId).first<{ room_id: string } & Omit<RoomRow, "id">>();
    if (!row) return json({ error: "メッセージが見つかりません" }, 404);
    const room: RoomRow = { id: row.room_id, ...row };
    if (!await canAccessRoom(env.DB, room, member))
      return json({ error: "このチャットを閲覧する権限がありません" }, 403);
    if (request.method === "PUT")
      await env.DB.prepare(`INSERT OR IGNORE INTO chat_message_reactions
        (message_id, member_id, emoji, created_at) VALUES (?, ?, ?, ?)`)
        .bind(messageId, member.id, emoji, new Date().toISOString()).run();
    else
      await env.DB.prepare(`DELETE FROM chat_message_reactions
        WHERE message_id = ? AND member_id = ? AND emoji = ?`)
        .bind(messageId, member.id, emoji).run();
    const reactions = await reactionRows(env.DB, [messageId]);
    return json({ success: true, reactions: reactionsFor(messageId, reactions) });
  }

  return json({ error: "対応していない操作です" }, 405);
}
