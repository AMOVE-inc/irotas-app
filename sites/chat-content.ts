import { authenticatedRequestMember, effectiveMemberRank } from "./auth";
import { canAccessRankRoom } from "../lib/chat-access";
import { canMemberAccessClub } from "./clubs";
import { mentionsViewer } from "../lib/mention-matching";
import { freeChatMentionGroups } from "../lib/chat-group-mentions";
import type { D1Database, SitesEnv } from "./platform-types";
import archive from "../data/discord-board-2026-08-29.json";
import type { RawDiscordBoardArchive } from "../lib/discord-board-import";
import { replyReference, validReplyReference } from "../lib/reply-reference";

const MESSAGES_PATH = /^\/api\/chats\/([^/]+)\/messages$/;
const ROOMS_PATH = "/api/chats";
const ROOM_PATH = /^\/api\/chats\/([^/]+)$/;
const MEMBERS_PATH = /^\/api\/chats\/([^/]+)\/members$/;
const MEMBER_PATH = /^\/api\/chats\/([^/]+)\/members\/([^/]+)$/;
const READ_PATH = /^\/api\/chats\/([^/]+)\/read$/;
const REACTIONS_PATH = "/api/chats/reactions";
const MESSAGE_PATH = /^\/api\/chats\/messages\/([^/]+)$/;
const MAX_BODY_BYTES = 64 * 1024;
const introductionThreadIds = new Set((archive as RawDiscordBoardArchive).threads.filter((thread) => thread.category === "introduction").map((thread) => thread.id));
const introductionReplies = new Map([
  ...(archive as RawDiscordBoardArchive).threads.filter((thread) => introductionThreadIds.has(thread.id)),
  ...(archive as RawDiscordBoardArchive).comments.filter((comment) => introductionThreadIds.has(comment.threadId)),
].map((record) => [`discord-introduction-${record.id}`, record]));

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
  image_urls_json: string;
  reply_to_json?: string | null;
  created_at: string;
  updated_at: string;
};
type ReactionRow = {
  message_id: string;
  emoji: string;
  member_id: number;
  public_member_id: string | null;
};

function isFreeChatRoom(room: RoomRow): boolean {
  return room.room_type === "club" || room.id === "community-free-chat" ||
    room.id === "branch-kanto-free" || room.id === "branch-kansai-free";
}

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
  return member.role === "admin" || member.role === "operator" || member.access_role === "admin" || member.access_role === "operator";
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

function validImageUrls(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) return null;
  const urls = value.map(validImageUrl);
  if (urls.some((url) => !url)) return null;
  return urls as string[];
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
      OR id = (SELECT source_id FROM chat_rooms WHERE id = ? AND room_type = 'event')
    LIMIT 1`).bind(roomId, roomId).first<{ id: string; title: string; organizer_member_id: number; public_data_json: string }>();
  if (!event) return null;
  if (event.id.startsWith("discord-event-")) return null;
  let origin: { recruitmentChannel?: string } = {};
  try { origin = JSON.parse(event.public_data_json) as typeof origin; } catch {}
  if (origin.recruitmentChannel === "discord") return null;
  const now = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO chat_rooms
    (id, name, room_type, source_id, created_by_member_id, created_at, updated_at)
    VALUES (?, ?, 'event', ?, ?, ?, ?)`).bind(
      roomId, event.title, event.id, event.organizer_member_id, now, now,
    ).run();
  await db.prepare(`INSERT INTO chat_room_members
    (room_id, member_id, member_role, joined_at, left_at)
    VALUES (?, ?, 'owner', ?, NULL)
    ON CONFLICT(room_id, member_id) DO UPDATE SET member_role = 'owner', left_at = NULL`)
    .bind(roomId, event.organizer_member_id, now).run();
  const confirmed = await db.prepare(`SELECT member_id FROM event_participations
    WHERE event_id = ? AND status IN ('confirmed', 'cancel_requested')`)
    .bind(event.id).all<{ member_id: number }>();
  if (confirmed.results?.length) {
    await db.batch(confirmed.results.map((item) => db.prepare(`INSERT INTO chat_room_members
      (room_id, member_id, member_role, joined_at, left_at)
      VALUES (?, ?, 'member', ?, NULL)
      ON CONFLICT(room_id, member_id) DO UPDATE SET member_role = 'member', left_at = NULL`)
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
      ON CONFLICT(room_id, member_id) DO UPDATE SET member_role = 'member', left_at = NULL`)
      .bind(roomId, companion.id, now).run();
  }
  return roomById(db, roomId);
}

async function syncClubRoom(db: D1Database, club: { id: string; name: string; leader_member_id: number | null }) {
  const roomId = `club-chat-${club.id}`;
  if (!validRoomId(roomId)) return null;
  const now = new Date().toISOString();
  const existingRoom = await roomById(db, roomId);
  if (!existingRoom) await db.prepare(`INSERT OR IGNORE INTO chat_rooms
    (id, name, room_type, source_id, created_at, updated_at)
    VALUES (?, ?, 'club', ?, ?, ?)`)
    .bind(roomId, `${club.name}チャット`, club.id, now, now).run();
  const desired = await db.prepare(`SELECT m.id AS member_id,
      CASE WHEN m.id = ? THEN 'owner' ELSE 'member' END AS member_role
    FROM members m WHERE m.account_status = 'active' AND
      (m.id = ? OR EXISTS (SELECT 1 FROM club_memberships cm
        WHERE cm.club_id = ? AND cm.member_id = m.id AND cm.status = 'approved'))`)
    .bind(club.leader_member_id, club.leader_member_id, club.id)
    .all<{ member_id: number; member_role: string }>();
  const current = await db.prepare(`SELECT member_id, member_role FROM chat_room_members
    WHERE room_id = ? AND left_at IS NULL`).bind(roomId).all<{ member_id: number; member_role: string }>();
  const currentRoles = new Map((current.results ?? []).map((item) => [item.member_id, item.member_role]));
  const expected = desired.results ?? [];
  if (expected.length === currentRoles.size && expected.every((item) => currentRoles.get(item.member_id) === item.member_role))
    return roomById(db, roomId);
  // 部員の承認・退部を毎回反映し、過去に参加していた人へ通知や参加者情報を漏らさない。
  await db.prepare(`INSERT INTO chat_room_members (room_id, member_id, member_role, joined_at, left_at)
    SELECT ?, m.id, CASE WHEN m.id = ? THEN 'owner' ELSE 'member' END, ?, NULL
    FROM members m
    WHERE m.account_status = 'active' AND
      (m.id = ? OR EXISTS (SELECT 1 FROM club_memberships cm
        WHERE cm.club_id = ? AND cm.member_id = m.id AND cm.status = 'approved'))
    ON CONFLICT(room_id, member_id) DO UPDATE SET
      member_role = excluded.member_role, left_at = NULL`)
    .bind(roomId, club.leader_member_id, now, club.leader_member_id, club.id).run();
  await db.prepare(`UPDATE chat_room_members SET left_at = ?
    WHERE room_id = ? AND left_at IS NULL AND member_id NOT IN (
      SELECT m.id FROM members m WHERE m.account_status = 'active' AND
        (m.id = ? OR EXISTS (SELECT 1 FROM club_memberships cm
          WHERE cm.club_id = ? AND cm.member_id = m.id AND cm.status = 'approved'))
    )`).bind(now, roomId, club.leader_member_id, club.id).run();
  return roomById(db, roomId);
}

async function ensureClubRoom(db: D1Database, roomId: string, syncMembers = false) {
  const clubId = roomId.startsWith("club-chat-") ? roomId.slice("club-chat-".length) : "";
  if (!clubId) return null;
  const club = await db.prepare("SELECT id, name, leader_member_id FROM clubs WHERE id = ? AND status = 'active' LIMIT 1")
    .bind(clubId).first<{ id: string; name: string; leader_member_id: number | null }>();
  if (!club) return null;
  const existing = await roomById(db, roomId);
  return existing && !syncMembers ? existing : syncClubRoom(db, club);
}

async function ensureClubRooms(db: D1Database, memberId: number) {
  const clubs = await db.prepare(`SELECT c.id, c.name, c.leader_member_id FROM clubs c
    WHERE c.status = 'active' AND (c.leader_member_id = ? OR EXISTS (
      SELECT 1 FROM club_memberships cm
      WHERE cm.club_id = c.id AND cm.member_id = ? AND cm.status = 'approved'))`)
    .bind(memberId, memberId)
    .all<{ id: string; name: string; leader_member_id: number | null }>();
  await Promise.all((clubs.results ?? []).map((club) => syncClubRoom(db, club)));
}

async function ensureKnownRoom(db: D1Database, roomId: string, syncClubMembers = false) {
  if (roomId.startsWith("club-chat-")) return ensureClubRoom(db, roomId, syncClubMembers);
  const existing = await roomById(db, roomId);
  if (existing) {
    // イベント参加状態を正として、過去の退出行や作成時の取りこぼしを開く前に修復する。
    if (existing.room_type === "event") return ensureEventRoom(db, roomId);
    // 支部フリーチャットはDiscord移行時の履歴を引き継がない。v2へ切り替える一度だけ、
    // 保存済みメッセージも論理削除して新しい参加者の起点を揃える。
    if ((roomId === "branch-kanto-free" || roomId === "branch-kansai-free") && !existing.source_id?.endsWith("-v2")) {
      const now = new Date().toISOString();
      const sourceId = `${existing.source_id ?? (roomId === "branch-kanto-free" ? "branch-kanto" : "branch-kansai")}-v2`;
      await db.batch([
        db.prepare("UPDATE chat_messages SET deleted_at = ?, updated_at = ? WHERE room_id = ? AND deleted_at IS NULL")
          .bind(now, now, roomId),
        db.prepare("UPDATE chat_room_members SET joined_at = ?, left_at = NULL WHERE room_id = ?")
          .bind(now, roomId),
        db.prepare("UPDATE chat_rooms SET source_id = ?, updated_at = ? WHERE id = ?")
          .bind(sourceId, now, roomId),
      ]);
      return roomById(db, roomId);
    }
    return existing;
  }
  if (roomId === "board-introduction") {
    const now = new Date().toISOString();
    await db.prepare(`INSERT OR IGNORE INTO chat_rooms
      (id, name, room_type, source_id, created_at, updated_at)
      VALUES (?, '自己紹介', 'board', 'introduction', ?, ?)`)
      .bind(roomId, now, now).run();
    return roomById(db, roomId);
  }
  if (roomId === "community-free-chat") {
    const now = new Date().toISOString();
    await db.prepare(`INSERT OR IGNORE INTO chat_rooms
      (id, name, room_type, source_id, created_at, updated_at)
      VALUES (?, 'フリーチャット', 'board', 'community-free-chat', ?, ?)`)
      .bind(roomId, now, now).run();
    return roomById(db, roomId);
  }
  if (roomId === "branch-kanto-free" || roomId === "branch-kansai-free") {
    const branch = roomId === "branch-kanto-free" ? "kanto" : "kansai";
    const name = branch === "kanto" ? "関東支部フリーチャット" : "関西支部フリーチャット";
    const now = new Date().toISOString();
    await db.prepare(`INSERT OR IGNORE INTO chat_rooms
      (id, name, room_type, source_id, created_at, updated_at)
      VALUES (?, ?, 'board', ?, ?, ?)`)
      .bind(roomId, name, `branch-${branch}-v2`, now, now).run();
    return roomById(db, roomId);
  }
  if (roomId.startsWith("event_chat_")) return ensureEventRoom(db, roomId);
  return null;
}

async function viewerRank(db: D1Database, memberId: number) {
  const row = await db.prepare("SELECT member_rank, discord_roles_json FROM members WHERE id = ? LIMIT 1")
    .bind(memberId).first<{ member_rank: string | null; discord_roles_json: string | null }>();
  return effectiveMemberRank(row?.member_rank, row?.discord_roles_json);
}

async function canAccessRoom(db: D1Database, room: RoomRow, member: Viewer) {
  if (room.room_type === "group") {
    const departed = await db.prepare(`SELECT 1 AS left FROM chat_room_members
      WHERE room_id = ? AND member_id = ? AND left_at IS NOT NULL LIMIT 1`)
      .bind(room.id, member.id).first<{ left: number }>();
    if (departed) return false;
  }
  if (room.room_type === "event") {
    if (room.source_id?.startsWith("discord-event-")) return false;
    const origin = await db.prepare("SELECT json_extract(public_data_json, '$.recruitmentChannel') AS channel FROM events WHERE id = ? LIMIT 1")
      .bind(room.source_id).first<{ channel: string | null }>();
    if (origin?.channel === "discord") return false;
  }
  // 通常の参加権限。運営・管理者による閲覧の例外は canViewRoom で扱う。
  if (room.room_type === "dm") {
    const membership = await db.prepare(`SELECT 1 AS allowed FROM chat_room_members
      WHERE room_id = ? AND member_id = ? AND left_at IS NULL LIMIT 1`)
      .bind(room.id, member.id).first<{ allowed: number }>();
    return Boolean(membership);
  }
  if (room.room_type === "club")
    return room.source_id ? canMemberAccessClub(db, room.source_id, member.id) : false;
  if (elevated(member)) return true;
  if (room.room_type === "board" && room.source_id === "introduction") return true;
  if (room.id === "community-free-chat" || (room.room_type === "board" && room.source_id === "community-free-chat")) return true;
  if (room.room_type === "board" && (room.source_id === "branch-kanto-v2" || room.source_id === "branch-kansai-v2")) {
    const expected = room.source_id === "branch-kanto-v2" ? "kanto" : "kansai";
    const row = await db.prepare("SELECT branches_json FROM members WHERE id = ? LIMIT 1").bind(member.id).first<{ branches_json: string | null }>();
    let branches: string[] = [];
    try { branches = JSON.parse(row?.branches_json ?? "[]") as string[]; } catch {}
    return branches.includes(expected);
  }
  if (room.room_type === "announcement") return true;
  if (room.room_type === "rank")
    return canAccessRankRoom(await viewerRank(db, member.id), room.required_rank);
  if (room.room_type === "event" && room.source_id) {
    const event = await db.prepare(`SELECT event_type, club_id, organizer_member_id
      FROM events WHERE id = ? LIMIT 1`).bind(room.source_id)
      .first<{ event_type: string; club_id: string | null; organizer_member_id: number }>();
    if (!event) return false;
    const admin = member.role === "admin" || member.access_role === "admin";
    if (event.event_type === "club" && event.club_id &&
      !await canMemberAccessClub(db, event.club_id, member.id, admin)) return false;
    if (event.organizer_member_id === member.id || elevated(member)) return true;
    const participation = await db.prepare(`SELECT status FROM event_participations
      WHERE event_id = ? AND member_id = ? LIMIT 1`)
      .bind(room.source_id, member.id).first<{ status: string }>();
    if (participation) return participation.status === "confirmed" || participation.status === "cancel_requested";
    // 同伴者はevent_participationsを持たないため、同期済みの参加行で判定する。
    const chatMembership = await db.prepare(`SELECT 1 AS allowed FROM chat_room_members
      WHERE room_id = ? AND member_id = ? AND left_at IS NULL LIMIT 1`)
      .bind(room.id, member.id).first<{ allowed: number }>();
    return Boolean(chatMembership);
  }
  const membership = await db.prepare(`SELECT 1 AS allowed FROM chat_room_members
    WHERE room_id = ? AND member_id = ? AND left_at IS NULL LIMIT 1`)
    .bind(room.id, member.id).first<{ allowed: number }>();
  return Boolean(membership);
}

async function canViewRoom(db: D1Database, room: RoomRow, member: Viewer) {
  return elevated(member) || canAccessRoom(db, room, member);
}

async function memberByPublicId(db: D1Database, memberId: string) {
  const numericId = /^member-(\d+)$/.exec(memberId)?.[1] ?? null;
  return db.prepare(`SELECT id, public_member_id, display_name
    FROM members WHERE account_status = 'active'
      AND (public_member_id = ? OR id = ?) LIMIT 1`)
    .bind(memberId, numericId).first<{ id: number; public_member_id: string | null; display_name: string }>();
}

async function canManageRoom(db: D1Database, room: RoomRow, member: Viewer) {
  if (room.room_type === "dm" && !await canAccessRoom(db, room, member)) return false;
  if (administrator(member)) return true;
  if (room.created_by_member_id === member.id) return true;
  const membership = await db.prepare(`SELECT member_role FROM chat_room_members
    WHERE room_id = ? AND member_id = ? AND left_at IS NULL LIMIT 1`)
    .bind(room.id, member.id).first<{ member_role: string }>();
  return membership?.member_role === "owner";
}

function mutableRoom(room: RoomRow) {
  return room.room_type === "dm" || room.room_type === "group" || room.room_type === "event" ||
    (room.room_type === "board" && !["community-free-chat", "board-introduction", "branch-kanto-free", "branch-kansai-free"].includes(room.id));
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
  let attachmentUrls: string[] = [];
  try {
    const parsed = JSON.parse(row.image_urls_json || "[]");
    if (Array.isArray(parsed)) attachmentUrls = parsed.filter((url): url is string => typeof url === "string" && validImageUrl(url) === url).slice(0, 10);
  } catch {}
  let replyTo;
  try {
    const parsed = JSON.parse(row.reply_to_json || "null");
    if (validReplyReference(parsed)) replyTo = parsed;
  } catch {}
  return {
    id: row.id,
    chatId: row.room_id,
    senderId: publicMemberId(row.sender_member_id, row.sender_public_member_id),
    externalAuthorName: (row.sender_display_name?.trim() || "メンバー").replace(/^deleted\s+user$/i, "未設定"),
    senderAvatar,
    content: row.content,
    replyTo,
    imageUri: attachmentUrls.length > 1 ? undefined : row.image_url || attachmentUrls[0] || undefined,
    attachmentUrls: attachmentUrls.length > 1 ? attachmentUrls : undefined,
    reactions: reactionsFor(row.id, reactions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shared: true,
  };
}

async function ensureBranchRoomMembership(db: D1Database, room: RoomRow, member: Viewer) {
  if (room.room_type !== "board" || (room.source_id !== "branch-kanto-v2" && room.source_id !== "branch-kansai-v2")) return null;
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO chat_room_members (room_id, member_id, member_role, joined_at, left_at)
    VALUES (?, ?, 'member', ?, NULL)
    ON CONFLICT(room_id, member_id) DO UPDATE SET left_at = NULL`)
    .bind(room.id, member.id, now).run();
  return db.prepare(`SELECT joined_at FROM chat_room_members
    WHERE room_id = ? AND member_id = ? AND left_at IS NULL LIMIT 1`)
    .bind(room.id, member.id).first<{ joined_at: string }>();
}

async function messageRows(db: D1Database, roomId: string, visibleFrom?: string) {
  const result = await db.prepare(`SELECT cm.id, cm.room_id, cm.sender_member_id,
      m.public_member_id AS sender_public_member_id, m.display_name AS sender_display_name, m.profile_json AS sender_profile_json,
      cm.content, cm.image_url, cm.image_urls_json, cm.reply_to_json, cm.created_at, cm.updated_at
    FROM chat_messages cm JOIN members m ON m.id = cm.sender_member_id
    WHERE cm.room_id = ? AND cm.deleted_at IS NULL AND (? IS NULL OR cm.created_at >= ?)
    ORDER BY cm.created_at ASC LIMIT 500`).bind(roomId, visibleFrom ?? null, visibleFrom ?? null).all<MessageRow>();
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
      AND id NOT LIKE 'discord-event-%' AND COALESCE(json_extract(public_data_json, '$.recruitmentChannel'), 'app') != 'discord'
      AND (organizer_member_id = ? OR EXISTS (
        SELECT 1 FROM event_participations ep WHERE ep.event_id = events.id
          AND ep.member_id = ? AND ep.status IN ('confirmed', 'cancel_requested')))
    ORDER BY event_date DESC LIMIT 30`).bind(member.id, member.id).all<{
      id: string; title: string; organizer_member_id: number; chat_id: string;
    }>();
  for (const event of result.results ?? []) {
    if (!event.chat_id || !validRoomId(event.chat_id)) continue;
    await ensureEventRoom(db, event.chat_id);
  }
}

async function serializeRoom(db: D1Database, room: RoomRow, member: Viewer, visibleFrom?: string) {
  const participantResult = await db.prepare(`SELECT crm.member_id, m.public_member_id, m.display_name
    FROM chat_room_members crm JOIN members m ON m.id = crm.member_id
    WHERE crm.room_id = ? AND crm.left_at IS NULL ORDER BY crm.joined_at`)
    .bind(room.id).all<{ member_id: number; public_member_id: string | null; display_name: string }>();
  const last = await db.prepare(`SELECT content, image_url, created_at FROM chat_messages
    WHERE room_id = ? AND deleted_at IS NULL AND (? IS NULL OR created_at >= ?)
    ORDER BY created_at DESC LIMIT 1`)
    .bind(room.id, visibleFrom ?? null, visibleFrom ?? null).first<{ content: string; image_url: string | null; created_at: string }>();
  const viewerDisplayName = (participantResult.results ?? []).find((item) => item.member_id === member.id)?.display_name ?? "";
  const unread = await db.prepare(`SELECT COUNT(*) AS count FROM chat_messages cm
    LEFT JOIN chat_room_reads crr ON crr.room_id = cm.room_id AND crr.member_id = ?
    WHERE cm.room_id = ? AND cm.deleted_at IS NULL AND cm.sender_member_id != ?
      AND (? IS NULL OR cm.created_at >= ?)
      AND julianday(cm.created_at) > julianday((SELECT COALESCE(password_set_at, last_signed_in_at) FROM members WHERE id = ?))
      AND (crr.last_read_at IS NULL OR cm.created_at > crr.last_read_at)`)
    .bind(member.id, room.id, member.id, visibleFrom ?? null, visibleFrom ?? null, member.id).first<{ count: number }>();
  const mentions = await db.prepare(`SELECT COUNT(*) AS count FROM chat_messages cm
    LEFT JOIN chat_room_reads crr ON crr.room_id = cm.room_id AND crr.member_id = ?
    WHERE cm.room_id = ? AND cm.deleted_at IS NULL AND cm.sender_member_id != ?
      AND (? IS NULL OR cm.created_at >= ?)
      AND julianday(cm.created_at) > julianday((SELECT COALESCE(password_set_at, last_signed_in_at) FROM members WHERE id = ?))
      AND (crr.last_read_at IS NULL OR cm.created_at > crr.last_read_at)
      AND (cm.content LIKE ? OR cm.content LIKE '%@全員%' OR cm.content LIKE '%@everyone%' OR cm.content LIKE '%@here%')`)
    .bind(member.id, room.id, member.id, visibleFrom ?? null, visibleFrom ?? null, member.id, `%@${viewerDisplayName}%`).first<{ count: number }>();
  const creator = room.created_by_member_id
    ? await db.prepare("SELECT public_member_id FROM members WHERE id = ? LIMIT 1")
      .bind(room.created_by_member_id).first<{ public_member_id: string | null }>()
    : null;
  const participants = participantResult.results ?? [];
  const viewerIsParticipant = participants.some((item) => item.member_id === member.id);
  const dmPartner = room.room_type === "dm" && viewerIsParticipant
    ? participants.find((item) => item.member_id !== member.id)
    : null;
  const dmName = room.room_type === "dm" && !viewerIsParticipant
    ? participants.map((item) => item.display_name).join("・") || room.name
    : dmPartner?.display_name;
  const cancelledEvent = room.room_type === "event" && room.source_id
    ? await db.prepare("SELECT title FROM events WHERE id = ? AND status = 'cancelled' LIMIT 1").bind(room.source_id).first<{ title: string }>()
    : null;
  return {
    id: room.id,
    name: dmName || (cancelledEvent ? `【開催中止】${cancelledEvent.title}` : room.name),
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

// The room list used to serialize every room with six separate database calls.
// Fetch participants and summaries in bounded batches so opening the chat tab
// does not wait for hundreds of round trips.
async function serializeRoomList(db: D1Database, rooms: RoomRow[], member: Viewer) {
  type Participant = { room_id: string; member_id: number; public_member_id: string | null; display_name: string };
  type Summary = {
    id: string; creator_public_member_id: string | null; cancelled_title: string | null;
    last_content: string | null; last_image_url: string | null; last_created_at: string | null;
    unread_count: number; mention_count: number;
  };
  const participantsByRoom = new Map<string, Participant[]>();
  const summaryByRoom = new Map<string, Summary>();
  const viewer = await db.prepare(`SELECT display_name, COALESCE(password_set_at, last_signed_in_at) AS started_at
    FROM members WHERE id = ?`).bind(member.id).first<{ display_name: string; started_at: string | null }>();
  for (let index = 0; index < rooms.length; index += 80) {
    const ids = rooms.slice(index, index + 80).map((room) => room.id);
    const placeholders = ids.map(() => "?").join(", ");
    const [participants, summaries] = await Promise.all([
      db.prepare(`SELECT crm.room_id, crm.member_id, m.public_member_id, m.display_name
        FROM chat_room_members crm JOIN members m ON m.id = crm.member_id
        WHERE crm.room_id IN (${placeholders}) AND crm.left_at IS NULL ORDER BY crm.joined_at`)
        .bind(...ids).all<Participant>(),
      db.prepare(`SELECT cr.id, creator.public_member_id AS creator_public_member_id,
        cancelled.title AS cancelled_title,
        (SELECT cm.content FROM chat_messages cm WHERE cm.room_id = cr.id AND cm.deleted_at IS NULL
          AND (mine.joined_at IS NULL OR cr.id NOT IN ('branch-kanto-free', 'branch-kansai-free') OR cm.created_at >= mine.joined_at)
          ORDER BY cm.created_at DESC LIMIT 1) AS last_content,
        (SELECT cm.image_url FROM chat_messages cm WHERE cm.room_id = cr.id AND cm.deleted_at IS NULL
          AND (mine.joined_at IS NULL OR cr.id NOT IN ('branch-kanto-free', 'branch-kansai-free') OR cm.created_at >= mine.joined_at)
          ORDER BY cm.created_at DESC LIMIT 1) AS last_image_url,
        (SELECT cm.created_at FROM chat_messages cm WHERE cm.room_id = cr.id AND cm.deleted_at IS NULL
          AND (mine.joined_at IS NULL OR cr.id NOT IN ('branch-kanto-free', 'branch-kansai-free') OR cm.created_at >= mine.joined_at)
          ORDER BY cm.created_at DESC LIMIT 1) AS last_created_at,
        (SELECT COUNT(*) FROM chat_messages cm LEFT JOIN chat_room_reads crr
          ON crr.room_id = cm.room_id AND crr.member_id = ?
          WHERE cm.room_id = cr.id AND cm.deleted_at IS NULL AND cm.sender_member_id != ?
          AND (mine.joined_at IS NULL OR cr.id NOT IN ('branch-kanto-free', 'branch-kansai-free') OR cm.created_at >= mine.joined_at)
          AND julianday(cm.created_at) > julianday(COALESCE(?, ?))
          AND (crr.last_read_at IS NULL OR cm.created_at > crr.last_read_at)) AS unread_count,
        (SELECT COUNT(*) FROM chat_messages cm LEFT JOIN chat_room_reads crr
          ON crr.room_id = cm.room_id AND crr.member_id = ?
          WHERE cm.room_id = cr.id AND cm.deleted_at IS NULL AND cm.sender_member_id != ?
          AND (mine.joined_at IS NULL OR cr.id NOT IN ('branch-kanto-free', 'branch-kansai-free') OR cm.created_at >= mine.joined_at)
          AND julianday(cm.created_at) > julianday(COALESCE(?, ?))
          AND (crr.last_read_at IS NULL OR cm.created_at > crr.last_read_at)
          AND (cm.content LIKE ? OR cm.content LIKE '%@全員%' OR cm.content LIKE '%@everyone%' OR cm.content LIKE '%@here%')) AS mention_count
        FROM chat_rooms cr
        LEFT JOIN chat_room_members mine ON mine.room_id = cr.id AND mine.member_id = ? AND mine.left_at IS NULL
        LEFT JOIN members creator ON creator.id = cr.created_by_member_id
        LEFT JOIN events cancelled ON cancelled.id = cr.source_id AND cr.room_type = 'event' AND cancelled.status = 'cancelled'
        WHERE cr.id IN (${placeholders})`)
        .bind(member.id, member.id, viewer?.started_at ?? null, viewer?.started_at ?? null,
          member.id, member.id, viewer?.started_at ?? null, viewer?.started_at ?? null,
          `%@${viewer?.display_name ?? ""}%`, member.id, ...ids).all<Summary>(),
    ]);
    for (const participant of participants.results ?? []) {
      const items = participantsByRoom.get(participant.room_id) ?? [];
      items.push(participant);
      participantsByRoom.set(participant.room_id, items);
    }
    for (const summary of summaries.results ?? []) summaryByRoom.set(summary.id, summary);
  }
  return rooms.map((room) => {
    const participants = participantsByRoom.get(room.id) ?? [];
    const summary = summaryByRoom.get(room.id);
    const viewerIsParticipant = participants.some((item) => item.member_id === member.id);
    const dmPartner = room.room_type === "dm" && viewerIsParticipant
      ? participants.find((item) => item.member_id !== member.id) : null;
    const dmName = room.room_type === "dm" && !viewerIsParticipant
      ? participants.map((item) => item.display_name).join("・") || room.name : dmPartner?.display_name;
    return {
      id: room.id,
      name: dmName || (summary?.cancelled_title ? `【開催中止】${summary.cancelled_title}` : room.name),
      type: room.room_type === "announcement" ? "board" : room.room_type,
      sourceId: room.source_id ?? room.id,
      participants: participants.map((item) => publicMemberId(item.member_id, item.public_member_id)),
      createdBy: room.created_by_member_id
        ? publicMemberId(room.created_by_member_id, summary?.creator_public_member_id ?? null) : "system",
      requiredRank: room.required_rank ?? undefined,
      lastMessage: summary?.last_content || (summary?.last_image_url ? "画像が送信されました" : ""),
      lastMessageAt: summary?.last_created_at ?? undefined,
      unreadCount: summary?.unread_count ?? 0,
      mentionCount: summary?.mention_count ?? 0,
      shared: true,
    };
  });
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
    // Only repair missing rooms for events this member actually attends or organizes.
    await ensureClubRooms(env.DB, member.id);
    await ensureKnownRoom(env.DB, "community-free-chat");
    // 一覧から開くケースでも、旧支部フリーチャットを先にv2へ移行して履歴を残さない。
    await ensureKnownRoom(env.DB, "branch-kanto-free");
    await ensureKnownRoom(env.DB, "branch-kansai-free");
    await ensureViewerEventRooms(env.DB, member);
    const result = await env.DB.prepare(`SELECT cr.id, cr.name, cr.room_type, cr.source_id, cr.required_rank, cr.created_by_member_id
      FROM chat_rooms cr WHERE cr.deleted_at IS NULL
      -- A departed room stays hidden for that member, including operators who
      -- can otherwise inspect all rooms. A new invitation clears left_at.
      AND (cr.room_type NOT IN ('event', 'dm', 'group', 'board') OR NOT EXISTS
        (SELECT 1 FROM chat_room_members departed
         WHERE departed.room_id = cr.id AND departed.member_id = ? AND departed.left_at IS NOT NULL))
      AND (cr.room_type != 'event' OR (cr.source_id NOT LIKE 'discord-event-%' AND NOT EXISTS (
        SELECT 1 FROM events e WHERE e.id = cr.source_id AND json_extract(e.public_data_json, '$.recruitmentChannel') = 'discord')))
      AND (
        ? = 1 OR cr.room_type IN ('announcement', 'rank', 'club')
        OR cr.id IN ('community-free-chat', 'branch-kanto-free', 'branch-kansai-free', 'board-introduction')
        OR EXISTS (SELECT 1 FROM chat_room_members crm WHERE crm.room_id = cr.id AND crm.member_id = ? AND crm.left_at IS NULL)
        OR (cr.room_type = 'event' AND EXISTS (SELECT 1 FROM event_participations ep
          WHERE ep.event_id = cr.source_id AND ep.member_id = ? AND ep.status IN ('confirmed', 'cancel_requested')))
      ) ORDER BY CASE WHEN cr.room_type = 'club' THEN 0 ELSE 1 END, cr.updated_at DESC LIMIT 1000`)
      .bind(member.id, elevated(member) ? 1 : 0, member.id, member.id).all<RoomRow>();
    const access = await Promise.all((result.results ?? []).map((room) => canViewRoom(env.DB!, room, member)));
    const visible = (result.results ?? []).filter((_, index) => access[index]);
    await Promise.all(visible.filter((room) => room.id === "branch-kanto-free" || room.id === "branch-kansai-free")
      .map((room) => ensureBranchRoomMembership(env.DB!, room, member)));
    return json({ rooms: await serializeRoomList(env.DB, visible, member) });
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
    if (!await (request.method === "GET" ? canViewRoom(env.DB, room, member) : canAccessRoom(env.DB, room, member)))
      return json({ error: "このチャットを閲覧する権限がありません" }, 403);
    if (request.method === "GET") return json({ room: await serializeRoom(env.DB, room, member) });
    if (request.method === "PATCH") {
      if (!mutableRoom(room) || room.room_type === "dm" || room.room_type === "event" || !await canManageRoom(env.DB, room, member))
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
      if (!mutableRoom(room) || room.room_type === "event" || !await canManageRoom(env.DB, room, member))
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
    const activeMembership = await env.DB.prepare(`SELECT 1 AS active FROM chat_room_members
      WHERE room_id = ? AND member_id = ? AND left_at IS NULL LIMIT 1`)
      .bind(roomId, target.id).first<{ active: number }>();
    if (!activeMembership) return json({ error: "チャットに参加していません" }, 409);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE chat_room_members SET left_at = ?
        WHERE room_id = ? AND member_id = ? AND left_at IS NULL`).bind(now, roomId, target.id),
      env.DB.prepare(`INSERT INTO chat_messages (id, room_id, sender_member_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(`chat_leave_${crypto.randomUUID()}`, roomId, target.id,
          `【IRO+ システム】${target.display_name}が退出しました`, now, now),
      env.DB.prepare("UPDATE chat_rooms SET updated_at = ? WHERE id = ?").bind(now, roomId),
    ]);
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
    if (!await canViewRoom(env.DB, room, member))
      return json({ error: "このチャットを閲覧する権限がありません" }, 403);
    await env.DB.prepare(`INSERT INTO chat_room_reads (room_id, member_id, last_read_at)
      VALUES (?, ?, ?) ON CONFLICT(room_id, member_id) DO UPDATE SET last_read_at = excluded.last_read_at`)
      .bind(roomId, member.id, new Date().toISOString()).run();
    return json({ success: true });
  }

  if (messagesMatch) {
    const roomId = decodeURIComponent(messagesMatch[1]);
    if (!validRoomId(roomId)) return json({ error: "チャットIDが不正です" }, 400);
    const room = await ensureKnownRoom(env.DB, roomId, request.method === "POST");
    if (!room) return json({ error: "チャットが見つかりません" }, 404);
    if (!await (request.method === "GET" ? canViewRoom(env.DB, room, member) : canAccessRoom(env.DB, room, member)))
      return json({ error: "このチャットを閲覧する権限がありません" }, 403);

    if (request.method === "GET") {
      const branchMembership = await ensureBranchRoomMembership(env.DB, room, member);
      const messages = await messageRows(env.DB, roomId, branchMembership?.joined_at);
      const reactions = await reactionRows(env.DB, messages.map((item) => item.id));
      return json({ messages: messages.map((item) => serializeMessage(item, reactions)) });
    }

    if (request.method === "POST") {
      if (!canPost(room, member)) return json({ error: "運営メンバーのみ送信できます" }, 403);
      const input = await readBody(request);
      const content = typeof input?.content === "string" ? input.content.trim() : "";
      const imageUrls = validImageUrls(input?.imageUrls);
      const legacyImageUrl = validImageUrl(input?.imageUrl);
      const imageUrl = imageUrls?.[0] || legacyImageUrl;
      const replyToId = input?.replyToId;
      if (replyToId !== undefined && (typeof replyToId !== "string" || !replyToId || replyToId.length > 160))
        return json({ error: "返信元が不正です" }, 400);
      if (!input || content.length > 10_000 || imageUrls === null || legacyImageUrl === null || (!content && !imageUrl))
        return json({ error: "メッセージ内容が不正です" }, 400);
      let replyTo = null;
      if (typeof replyToId === "string") {
        const source = await env.DB.prepare(`SELECT cm.content, cm.image_url, m.display_name
          FROM chat_messages cm JOIN members m ON m.id = cm.sender_member_id
          WHERE cm.id = ? AND cm.room_id = ? AND cm.deleted_at IS NULL LIMIT 1`)
          .bind(replyToId, roomId).first<{ content: string; image_url: string | null; display_name: string }>();
        if (source) replyTo = replyReference(replyToId, source.display_name, source.content, Boolean(source.image_url));
        else if (roomId === "board-introduction") {
          const imported = introductionReplies.get(replyToId);
          if (imported) replyTo = replyReference(replyToId, imported.authorName, imported.content, imported.images.length > 0);
        }
        if (!replyTo) return json({ error: "返信元が見つかりません" }, 404);
      }
      const requestedId = typeof input.clientMessageId === "string" && /^cm_[a-zA-Z0-9_-]{12,80}$/.test(input.clientMessageId)
        ? input.clientMessageId : null;
      const id = requestedId ?? crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(`INSERT OR IGNORE INTO chat_messages
        (id, room_id, sender_member_id, content, image_url, image_urls_json, reply_to_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          id, roomId, member.id, content, imageUrl || null, JSON.stringify(imageUrls), replyTo ? JSON.stringify(replyTo) : null, now, now,
        ).run();
      if (roomId === "board-introduction") {
        await env.DB.prepare(`INSERT OR IGNORE INTO chat_message_reactions
          (message_id, member_id, emoji, created_at) VALUES (?, ?, '🎉', ?)`)
          .bind(id, member.id, now).run();
      }
      if (requestedId) {
        const existing = await env.DB.prepare("SELECT room_id, sender_member_id FROM chat_messages WHERE id = ? LIMIT 1")
          .bind(id).first<{ room_id: string; sender_member_id: number }>();
        if (!existing || existing.room_id !== roomId || existing.sender_member_id !== member.id)
          return json({ error: "メッセージIDが不正です" }, 409);
      }
      await env.DB.prepare("UPDATE chat_rooms SET updated_at = ? WHERE id = ?")
        .bind(now, roomId).run();
      const author = await env.DB.prepare("SELECT display_name FROM members WHERE id = ? LIMIT 1")
        .bind(member.id).first<{ display_name: string }>();
      const notificationBody = `${author?.display_name || "メンバー"}: ${(content || "画像が送信されました").replace(/\s+/g, " ").slice(0, 160)}`;
      if (isFreeChatRoom(room)) {
        // フリーチャットはメンション時だけ通知する。グループ宛てでも閲覧できない会員には送らない。
        if (content.includes("@")) {
          const groups = freeChatMentionGroups(content, room.id);
          const recipients = await env.DB.prepare(`SELECT id, display_name, public_member_id, branches_json, role, access_role
            FROM members WHERE account_status = 'active' AND id != ?`)
            .bind(member.id).all<{ id: number; display_name: string; public_member_id: string | null; branches_json: string | null; role: string | null; access_role: string | null }>();
          const mentioned = (recipients.results ?? []).filter((recipient) => {
            if (groups.roomEveryone || mentionsViewer(content, [recipient.display_name, recipient.public_member_id ?? ""])) return true;
            let branches: string[] = [];
            try { branches = JSON.parse(recipient.branches_json ?? "[]") as string[]; } catch {}
            const currentBranch = room.id === "branch-kanto-free" ? "kanto" : room.id === "branch-kansai-free" ? "kansai" : null;
            return (groups.branchEveryone && currentBranch !== null && branches.includes(currentBranch)) ||
              (groups.kanto && branches.includes("kanto")) || (groups.kansai && branches.includes("kansai"));
          });
          const clubMemberIds = room.room_type === "club"
            ? new Set((await env.DB.prepare(`SELECT member_id FROM chat_room_members
              WHERE room_id = ? AND left_at IS NULL`).bind(room.id).all<{ member_id: number }>()).results?.map((item) => item.member_id) ?? [])
            : null;
          const eligible = mentioned.filter((recipient) => {
            if (clubMemberIds) return clubMemberIds.has(recipient.id);
            if (room.id === "branch-kanto-free" || room.id === "branch-kansai-free") {
              let branches: string[] = [];
              try { branches = JSON.parse(recipient.branches_json ?? "[]") as string[]; } catch {}
              if (branches.includes(room.id === "branch-kanto-free" ? "kanto" : "kansai")) return true;
              const staff = recipient.role === "admin" || recipient.role === "operator" || recipient.access_role === "admin" || recipient.access_role === "operator";
              return staff && mentionsViewer(content, [recipient.display_name, recipient.public_member_id ?? ""]);
            }
            return true;
          });
          const statements = eligible
            .map((recipient) => env.DB!.prepare(`INSERT OR IGNORE INTO in_app_notifications
              (id, target_member_id, type, title, body, chat_room_id, target_path, created_at)
              VALUES (?, ?, 'chat', ?, ?, ?, ?, ?)`)
              .bind(`chat-message:${id}:${recipient.id}`, recipient.id, room.name, notificationBody, roomId, `/chat?id=${encodeURIComponent(roomId)}`, now));
          for (let start = 0; start < statements.length; start += 100)
            await env.DB.batch(statements.slice(start, start + 100));
        }
      } else {
        await env.DB.prepare(`INSERT OR IGNORE INTO in_app_notifications
          (id, target_member_id, type, title, body, chat_room_id, target_path, created_at)
          SELECT ? || ':' || crm.member_id, crm.member_id, 'chat', ?, ?, ?, ?, ?
          FROM chat_room_members crm
          WHERE crm.room_id = ? AND crm.left_at IS NULL AND crm.member_id != ?`)
          .bind(`chat-message:${id}`, room.name, notificationBody, roomId, `/chat?id=${encodeURIComponent(roomId)}`, now, roomId, member.id).run();
      }
      await audit(env.DB, member.id, "chat.message_created", id);
      const rows = await messageRows(env.DB, roomId);
      const created = rows.find((item) => item.id === id);
      const createdReactions = roomId === "board-introduction" ? await reactionRows(env.DB, [id]) : [];
      return json({ message: created ? serializeMessage(created, createdReactions) : null }, 201);
    }
    return json({ error: "対応していない操作です" }, 405);
  }

  if (messageMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    const messageId = decodeURIComponent(messageMatch[1]);
    const existing = await env.DB.prepare(`SELECT id, room_id, sender_member_id
      FROM chat_messages WHERE id = ? AND deleted_at IS NULL LIMIT 1`).bind(messageId)
      .first<{ id: string; room_id: string; sender_member_id: number }>();
    if (!existing) return json({ error: "メッセージが見つかりません" }, 404);
    if (request.method === "PATCH" && existing.sender_member_id !== member.id)
      return json({ error: "自分のメッセージのみ編集できます" }, 403);
    if (request.method === "DELETE" && existing.sender_member_id !== member.id && !administrator(member))
      return json({ error: "自分のメッセージまたは管理者のみ削除できます" }, 403);
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
    const content = typeof input?.content === "string" ? input.content.trim() : "";
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
