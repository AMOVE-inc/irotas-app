import { authenticatedRequestMember } from "./auth";
import { canMemberAccessClub } from "./clubs";
import { reverseCancelledEventHostXp } from "./event-host-xp";
import { applyEventPointDiscount, refundEventPointDiscount } from "./event-points";
import { EVENT_XP, awardEventReward, reverseEventRewards } from "./event-rewards";
import type { D1Database, SitesEnv } from "./platform-types";

const EVENTS_ENDPOINT = "/api/events";
const EVENT_PATH = /^\/api\/events\/([^/]+)$/;
const EVENT_FAVORITE_PATH = /^\/api\/events\/([^/]+)\/favorite$/;
const EVENT_APPLICATION_PATH = /^\/api\/events\/([^/]+)\/applications$/;
const EVENT_FINALIZE_PATH = /^\/api\/events\/([^/]+)\/finalize$/;
const EVENT_PARTICIPANT_PATH = /^\/api\/events\/([^/]+)\/participants\/([^/]+)$/;
const EVENT_CANCELLATION_PATH = /^\/api\/events\/([^/]+)\/cancellation-requests$/;
const EVENT_CANCELLATION_REVIEW_PATH = /^\/api\/events\/([^/]+)\/cancellation-requests\/([^/]+)$/;
const EVENT_ATTENDANCE_PATH = /^\/api\/events\/([^/]+)\/attendance$/;
const EVENT_CANCELLATION_PREVIEW_PATH = /^\/api\/events\/([^/]+)\/cancellation-penalty-preview$/;
const DEPRECATED_TEST_EVENT_TITLES = ["恵比寿で楽しむ夏のビストロ会"];
const EVENT_IMAGE_PATH = /^\/api\/event-images\/([^/]+)$/;
const MAX_EVENT_BODY_BYTES = 96 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DELETED_EVENT_IDS = new Set(["discord-event-1504772980851478548"]);

type EventRow = {
  id: string;
  organizer_member_id: number;
  public_member_id: string | null;
  organizer_display_name?: string | null;
  organizer_member_rank?: string | null;
  organizer_access_role?: "admin" | "operator" | "member" | null;
  organizer_profile_json?: string | null;
  event_type: "official" | "gourmet" | "club";
  club_id: string | null;
  event_date: string;
  status: "open" | "full" | "ended" | "cancelled";
  title: string;
  public_data_json: string;
  private_memo: string | null;
  created_at: string;
};

type ParticipationRow = {
  event_id: string;
  member_id: number;
  public_member_id: string | null;
  status: "applied" | "confirmed" | "cancel_requested" | "cancelled" | "rejected";
};

type CancellationRow = {
  event_id: string;
  member_id: number;
  public_member_id: string | null;
  requested_at: string;
  contacted_organizer: number;
  policy_confirmed: number;
  status: "pending" | "approved" | "rejected";
};

function eventStart(row: EventRow) {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
  const time = typeof data.time === "string" && /^\d{2}:\d{2}$/.test(data.time) ? data.time : "00:00";
  const value = new Date(`${row.event_date}T${time}:00+09:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function japanDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function lateCancellationCutoff(row: EventRow) {
  // Policy is calendar-based in JST: 00:00 on the previous calendar day, not "24 hours before".
  const localCutoff = new Date(`${row.event_date}T00:00:00+09:00`);
  localCutoff.setUTCDate(localCutoff.getUTCDate() - 1);
  return localCutoff;
}

function isLateCancellation(row: EventRow, requestedAt: Date) {
  const start = eventStart(row);
  if (!start) return false;
  const cutoff = lateCancellationCutoff(row);
  return requestedAt.getTime() >= cutoff.getTime() && requestedAt.getTime() <= start.getTime();
}

async function activePenaltySummary(db: D1Database, memberId: number, now: string) {
  const result = await db.prepare(`SELECT COUNT(*) AS count, MIN(expires_at) AS earliest
    FROM event_cancellation_penalties WHERE member_id = ? AND revoked_at IS NULL AND expires_at > ?`)
    .bind(memberId, now).first<{ count: number; earliest: string | null }>();
  return { activePoints: Number(result?.count ?? 0), earliestExpiry: result?.earliest ?? null };
}

async function currentRestriction(db: D1Database, memberId: number, now: string) {
  return db.prepare(`SELECT ends_at FROM event_participation_restrictions
    WHERE member_id = ? AND revoked_at IS NULL AND ends_at > ? ORDER BY ends_at DESC LIMIT 1`)
    .bind(memberId, now).first<{ ends_at: string }>();
}

function addTokyoMonths(iso: string, monthsToAdd: number) {
  const date = new Date(iso);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const values = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const year = Number(values.year), month = Number(values.month), day = Number(values.day);
  const targetIndex = (year * 12 + (month - 1)) + monthsToAdd;
  const targetYear = Math.floor(targetIndex / 12);
  const targetMonth = (targetIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return new Date(`${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}T${values.hour}:${values.minute}:${values.second}+09:00`).toISOString();
}

function nextMonthSameTokyoTime(iso: string) {
  return addTokyoMonths(iso, 1);
}

async function applyLateCancellationPenalty(db: D1Database, input: { eventId: string; memberId: number; assignedBy: number; assignedAt: string; title: string }) {
  const exists = await db.prepare("SELECT id FROM event_cancellation_penalties WHERE event_id = ? AND member_id = ? LIMIT 1")
    .bind(input.eventId, input.memberId).first<{ id: string }>();
  if (exists) return { ...(await activePenaltySummary(db, input.memberId, input.assignedAt)), restrictionUntil: (await currentRestriction(db, input.memberId, input.assignedAt))?.ends_at ?? null, duplicate: true };
  const expiresAt = addTokyoMonths(input.assignedAt, 3);
  const penaltyId = `penalty_${crypto.randomUUID()}`;
  await db.prepare(`INSERT INTO event_cancellation_penalties
    (id,event_id,member_id,points,assigned_at,expires_at,assigned_by_member_id,reason)
    VALUES (?,?,?,?,?,?,?,?)`).bind(penaltyId, input.eventId, input.memberId, 1, input.assignedAt, expiresAt, input.assignedBy, "前日・当日のキャンセル").run();
  const summary = await activePenaltySummary(db, input.memberId, input.assignedAt);
  let restrictionUntil = (await currentRestriction(db, input.memberId, input.assignedAt))?.ends_at ?? null;
  if (summary.activePoints >= 3 && !restrictionUntil) {
    restrictionUntil = nextMonthSameTokyoTime(input.assignedAt);
    await db.prepare(`INSERT INTO event_participation_restrictions
      (id,member_id,starts_at,ends_at,trigger_penalty_id,created_at) VALUES (?,?,?,?,?,?)`)
      .bind(`restriction_${crypto.randomUUID()}`, input.memberId, input.assignedAt, restrictionUntil, penaltyId, input.assignedAt).run();
  }
  const body = restrictionUntil
    ? `「${input.title}」のキャンセルによりペナルティポイントが1点付与されました。現在${summary.activePoints}点のため、${restrictionUntil.replace("T", " ").slice(0, 16)}まで新規申込・参加はできません。すでに参加確定しているイベントは取り消されません。`
    : `「${input.title}」のキャンセルによりペナルティポイントが1点付与されました。現在${summary.activePoints}点です。ポイントは付与日から3か月で失効します。`;
  await db.prepare(`INSERT OR IGNORE INTO in_app_notifications
    (id,target_member_id,type,title,body,event_id,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(`late-cancellation:${input.eventId}:${input.memberId}`, input.memberId, "event_cancellation", "キャンセルとペナルティポイントについて", body, input.eventId, input.assignedAt).run();
  return { ...summary, restrictionUntil, duplicate: false };
}

function responseJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function text(value: unknown, maximum: number, required = false) {
  if (typeof value !== "string") return required ? null : "";
  const normalized = value.normalize("NFKC").trim();
  if ((required && !normalized) || normalized.length > maximum) return null;
  return normalized;
}

function number(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function priceNumber(value: unknown) {
  const match = String(value ?? "").replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function stringArray(value: unknown, maximumItems: number, maximumLength = 80) {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const result = value.map((item) => text(item, maximumLength, true));
  return result.every((item): item is string => item !== null) ? result : null;
}

export function sanitizeEvent(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const eventType = ["official", "gourmet", "club"].includes(String(input.eventType))
    ? String(input.eventType) as "official" | "gourmet" | "club"
    : null;
  const title = text(input.title, 160, true);
  const date = text(input.date, 10, true);
  const time = text(input.time, 5, true);
  const capacity = number(input.capacity, 1, 100);
  const reservationCapacity = number(input.reservationCapacity, 1, 101);
  const genres = stringArray(input.genres, 20);
  if (!eventType || !title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time || !/^([01]\d|2[0-3]):(00|15|30|45)$/.test(time) || capacity === null || reservationCapacity === null || genres === null)
    return null;
  const clubId = text(input.clubId, 80);
  if (eventType === "club" && !clubId) return null;
  const image = text(input.image, 500);
  if (image && !image.startsWith("/api/event-images/")) return null;
  const applicationDeadline = text(input.applicationDeadline, 10, true);
  if (!applicationDeadline || !/^\d{4}-\d{2}-\d{2}$/.test(applicationDeadline) || applicationDeadline > date) return null;
  const priceMin = number(input.priceMin, 0, 300_000);
  const priceMax = number(input.priceMax, 0, 300_000);
  if (priceMin === null || priceMax === null || priceMin > priceMax) return null;

  return {
    eventType,
    clubId: clubId || undefined,
    title,
    restaurantName: text(input.restaurantName, 160) || undefined,
    description: text(input.description, 5000) || "",
    date,
    time,
    location: text(input.location, 500) || "住所未設定",
    prefecture: text(input.prefecture, 16) || undefined,
    tokyoArea: text(input.tokyoArea, 80) || undefined,
    image: image || "",
    capacity,
    reservationCapacity,
    attendees: 0,
    applicantIds: [] as string[],
    participants: [] as string[],
    companionIds: stringArray(input.companionIds, 100, 40) ?? [],
    price: text(input.price, 80) || "",
    priceMin,
    priceMax,
    genres,
    rankPrices: input.rankPrices && typeof input.rankPrices === "object" ? input.rankPrices : undefined,
    category: ["all", "kanto", "kansai"].includes(String(input.category)) ? input.category : "all",
    status: "open" as const,
    recruitmentStatus: eventType === "official" && input.recruitmentStatus === "draft" ? "draft" as const : "open" as const,
    applicationDeadline,
    cancellationPolicy: text(input.cancellationPolicy, 2000) || "",
    selectionMethod: input.selectionMethod === "lottery" ? "lottery" as const : "first_come" as const,
    tabelogUrl: text(input.tabelogUrl, 500) || undefined,
    googleMapsUrl: text(input.googleMapsUrl, 500) || undefined,
    publicNotes: text(input.publicNotes, 5000) || undefined,
  };
}

function publicId(row: { member_id: number; public_member_id: string | null }) {
  return row.public_member_id ?? `member-${row.member_id}`;
}

function organizerProfile(row: EventRow) {
  try {
    const value = JSON.parse(row.organizer_profile_json ?? "{}") as Record<string, unknown>;
    return typeof value.avatarUrl === "string" ? value.avatarUrl : undefined;
  } catch {
    return undefined;
  }
}

function publicEvent(
  row: EventRow,
  viewerId: number,
  viewerPublicId: string,
  elevated: boolean,
  participations: ParticipationRow[] = [],
  cancellations: CancellationRow[] = [],
  favorite = false,
) {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
  const participantsFinalized = typeof data.participantsFinalizedAt === "string" && data.participantsFinalizedAt.length > 0;
  const active = participations.filter((item) => item.status === "applied" || item.status === "confirmed" || item.status === "cancel_requested");
  const confirmed = active.filter((item) => item.status === "confirmed" || item.status === "cancel_requested");
  const manualParticipantIds = Array.isArray(data.manualParticipantIds)
    ? data.manualParticipantIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : [];
  const participantIds = [...new Set([...confirmed.map(publicId), ...manualParticipantIds])];
  const cancelledParticipantIds = row.status === "cancelled" ? participantIds : [];
  const viewerParticipation = active.find((item) => item.member_id === viewerId)?.status ?? null;
  return {
    ...data,
    id: row.id,
    createdAt: row.created_at,
    eventType: row.event_type,
    clubId: row.club_id ?? undefined,
    date: row.event_date,
    // 定員に達していても、幹事が参加者を確定するまでは受付を継続する。
    status: row.status === "cancelled" ? "ended" : row.status === "full" && !participantsFinalized ? "open" : row.status,
    isCancelled: row.status === "cancelled",
    title: row.title,
    createdBy: row.public_member_id ?? `member-${row.organizer_member_id}`,
    organizerProfileId: row.public_member_id ?? `member-${row.organizer_member_id}`,
    organizerName: row.organizer_display_name?.trim() || "メンバー",
    organizerAvatar: organizerProfile(row),
    organizerRank: row.organizer_member_rank ?? undefined,
    organizerAccessRole: row.organizer_access_role ?? undefined,
    applicantIds: row.status === "cancelled" ? [] : active.map(publicId),
    participants: row.status === "cancelled" ? [] : participantIds,
    cancelledParticipantIds,
    attendees: row.status === "cancelled" ? 0 : Math.max(active.length, participantIds.length),
    cancellationRequests: cancellations.map((item) => ({
      memberId: publicId(item),
      requestedAt: item.requested_at,
      contactedOrganizer: item.contacted_organizer === 1,
      policyConfirmed: item.policy_confirmed === 1,
      status: item.status,
    })),
    viewerMemberId: viewerPublicId,
    viewerParticipationStatus: viewerParticipation === "cancel_requested" ? "cancel_requested" : viewerParticipation,
    isFavorite: favorite,
    isOrganizer: viewerId === row.organizer_member_id,
    ...(viewerId === row.organizer_member_id || elevated ? { privateMemo: row.private_memo ?? undefined } : {}),
  };
}

export function lockedClubEventPreview(row: EventRow) {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
  return {
    id: row.id,
    createdAt: row.created_at,
    eventType: "club" as const,
    clubId: row.club_id ?? undefined,
    date: row.event_date,
    status: row.status === "cancelled" ? "ended" as const : row.status,
    title: row.title,
    image: typeof data.image === "string" && data.image.startsWith("/api/event-images/") ? data.image : "",
    createdBy: row.public_member_id ?? `member-${row.organizer_member_id}`,
    organizerProfileId: row.public_member_id ?? `member-${row.organizer_member_id}`,
    organizerName: row.organizer_display_name?.trim() || "メンバー",
    organizerAvatar: organizerProfile(row),
    organizerRank: row.organizer_member_rank ?? undefined,
    description: "",
    time: "",
    location: "部員限定",
    capacity: 0,
    reservationCapacity: 0,
    attendees: 0,
    participants: [] as string[],
    applicantIds: [] as string[],
    companionIds: [] as string[],
    price: "",
    priceMin: 0,
    priceMax: 0,
    genres: [] as string[],
    category: "all" as const,
    lockedClubEvent: true,
  };
}

const selectEvents = `SELECT e.*, m.public_member_id,
  m.display_name AS organizer_display_name,
  m.member_rank AS organizer_member_rank,
  m.access_role AS organizer_access_role,
  m.profile_json AS organizer_profile_json
  FROM events e JOIN members m ON m.id = e.organizer_member_id`;

function isElevated(member: NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>) {
  return member.access_role === "operator" || member.access_role === "admin" || member.role === "operator" || member.role === "admin";
}

function isAdmin(member: NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>) {
  return member.access_role === "admin" || member.role === "admin";
}

async function viewerPublicId(db: D1Database, memberId: number) {
  const row = await db.prepare("SELECT public_member_id FROM members WHERE id = ?").bind(memberId).first<{ public_member_id: string | null }>();
  return row?.public_member_id ?? `member-${memberId}`;
}

async function hydratedEvent(db: D1Database, row: EventRow, memberId: number, elevated: boolean, viewerId?: string) {
  const [participations, cancellations, favorite] = await Promise.all([
    db.prepare(`SELECT p.event_id, p.member_id, m.public_member_id, p.status
      FROM event_participations p JOIN members m ON m.id = p.member_id WHERE p.event_id = ?`)
      .bind(row.id).all<ParticipationRow>(),
    db.prepare(`SELECT c.event_id, c.member_id, m.public_member_id, c.requested_at,
        c.contacted_organizer, c.policy_confirmed, c.status
      FROM event_cancellation_requests c JOIN members m ON m.id = c.member_id
      WHERE c.event_id = ? ORDER BY c.requested_at DESC`)
      .bind(row.id).all<CancellationRow>(),
    db.prepare("SELECT 1 AS present FROM event_favorites WHERE event_id = ? AND member_id = ?")
      .bind(row.id, memberId).first<{ present: number }>(),
  ]);
  return publicEvent(row, memberId, viewerId ?? await viewerPublicId(db, memberId), elevated, participations.results ?? [], cancellations.results ?? [], Boolean(favorite));
}

async function readBody(request: Request) {
  try { return await request.json() as Record<string, unknown>; } catch { return null; }
}

async function eventRow(db: D1Database, eventId: string) {
  return db.prepare(`${selectEvents} WHERE e.id = ? LIMIT 1`).bind(eventId).first<EventRow>();
}

async function memberIdFromPublicId(db: D1Database, value: string) {
  const direct = /^member-(\d+)$/.exec(value);
  if (direct) return Number(direct[1]);
  const row = await db.prepare("SELECT id FROM members WHERE public_member_id = ? LIMIT 1").bind(value).first<{ id: number }>();
  return row?.id ?? null;
}

async function audit(db: D1Database, actorId: number, action: string, eventId: string, metadata: Record<string, unknown> = {}) {
  await db.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
    VALUES (?, ?, 'event', ?, ?, ?)`).bind(String(actorId), action, eventId, JSON.stringify(metadata), new Date().toISOString()).run();
}

function eventChatId(eventId: string) {
  return `event_chat_${eventId}`;
}

function eventChatSystemContent(message: string) {
  return `【IRO+ システム】${message}`;
}

async function eventChatMemberName(db: D1Database, memberId: number) {
  const member = await db.prepare("SELECT display_name FROM members WHERE id = ? LIMIT 1")
    .bind(memberId).first<{ display_name: string | null }>();
  return (member?.display_name ?? "")
    .replace(/【[^】]*(?:REGULAR|SILVER|GOLD|PLATINUM|レギュラー|シルバー|ゴールド|プラチナ)[^】]*】/gi, "")
    .replace(/[\p{Extended_Pictographic}\uFE0F]\s*[^\s【】]{1,20}部長$/u, "")
    .trim() || "メンバー";
}

async function notifyEventConfirmation(db: D1Database, targetMemberId: number, eventId: string, eventTitle: string) {
  await db.prepare(`INSERT INTO in_app_notifications
    (id, target_member_id, type, title, body, event_id, created_at)
    VALUES (?, ?, 'event_confirmed', ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(),
      targetMemberId,
      "イベント参加が確定しました",
      `「${eventTitle}」の参加者専用チャットへ追加されました。`,
      eventId,
      new Date().toISOString(),
    ).run();
}

async function notifyEventCancellation(
  db: D1Database,
  targetMemberId: number,
  eventId: string,
  title: string,
  body: string,
) {
  await db.prepare(`INSERT INTO in_app_notifications
    (id, target_member_id, type, title, body, event_id, created_at)
    VALUES (?, ?, 'event_cancellation', ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), targetMemberId, title, body, eventId, new Date().toISOString()).run();
}

async function postEventCancellationToConfirmedChat(
  db: D1Database,
  row: EventRow,
  actorMemberId: number,
  now: string,
) {
  const participations = await db.prepare(`SELECT member_id, status FROM event_participations
    WHERE event_id = ? AND status IN ('applied', 'confirmed', 'cancel_requested')`).bind(row.id).all<{ member_id: number; status: string }>();
  const confirmed = (participations.results ?? []).filter((participant) => participant.status === "confirmed" || participant.status === "cancel_requested");
  const body = `【イベント中止のお知らせ】「${row.title}」は中止となりました。`;
  for (const participant of participations.results ?? []) {
    await notifyEventCancellation(db, participant.member_id, row.id, "イベントが中止されました", body);
  }
  if (!confirmed.length) return;
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
  const chatId = typeof data.chatId === "string" && data.chatId ? data.chatId : eventChatId(row.id);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO chat_rooms (id, name, room_type, source_id, created_by_member_id, created_at, updated_at)
      VALUES (?, ?, 'event', ?, ?, ?, ?)`).bind(chatId, `【開催中止】${row.title}`, row.id, row.organizer_member_id, now, now),
    db.prepare("UPDATE chat_rooms SET name = ?, updated_at = ? WHERE id = ?").bind(`【開催中止】${row.title}`, now, chatId),
    db.prepare(`INSERT INTO chat_room_members (room_id, member_id, member_role, joined_at, left_at)
      VALUES (?, ?, 'owner', ?, NULL)
      ON CONFLICT(room_id, member_id) DO UPDATE SET member_role = 'owner', left_at = NULL`)
      .bind(chatId, row.organizer_member_id, now),
    ...confirmed.map((participant) => db.prepare(`INSERT INTO chat_room_members
      (room_id, member_id, member_role, joined_at, left_at) VALUES (?, ?, 'member', ?, NULL)
      ON CONFLICT(room_id, member_id) DO UPDATE SET left_at = NULL`)
      .bind(chatId, participant.member_id, now)),
    db.prepare(`INSERT INTO chat_messages (id, room_id, sender_member_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(`event_cancel_${crypto.randomUUID()}`, chatId, actorMemberId, body, now, now),
  ]);
}

/** Keeps an organizer cancellation visible in both the participant chat and Home notifications. */
async function notifyOrganizerParticipantCancellation(
  db: D1Database,
  row: EventRow,
  targetMemberId: number,
  actorMemberId: number,
  now: string,
) {
  const targetName = await eventChatMemberName(db, targetMemberId);
  const body = eventChatSystemContent(`${targetName}の参加がキャンセルされました`);
  await notifyEventCancellation(db, targetMemberId, row.id, "イベント参加が取り消されました", body);
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
  const chatId = typeof data.chatId === "string" && data.chatId ? data.chatId : eventChatId(row.id);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO chat_rooms (id, name, room_type, source_id, created_by_member_id, created_at, updated_at)
      VALUES (?, ?, 'event', ?, ?, ?, ?)`).bind(chatId, row.title, row.id, row.organizer_member_id, now, now),
    db.prepare(`INSERT INTO chat_room_members (room_id, member_id, member_role, joined_at, left_at)
      VALUES (?, ?, 'owner', ?, NULL)
      ON CONFLICT(room_id, member_id) DO UPDATE SET member_role = 'owner', left_at = NULL`)
      .bind(chatId, row.organizer_member_id, now),
    db.prepare(`INSERT INTO chat_room_members (room_id, member_id, member_role, joined_at, left_at)
      VALUES (?, ?, 'member', ?, NULL)
      ON CONFLICT(room_id, member_id) DO UPDATE SET left_at = NULL`)
      .bind(chatId, targetMemberId, now),
    db.prepare(`INSERT INTO chat_messages (id, room_id, sender_member_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(`event_participant_cancel_${crypto.randomUUID()}`, chatId, actorMemberId, body, now, now),
  ]);
}

async function createEvent(request: Request, db: D1Database, member: Awaited<ReturnType<typeof authenticatedRequestMember>>) {
  if (!member) return responseJson({ error: "ログインが必要です" }, 401);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_EVENT_BODY_BYTES)
    return responseJson({ error: "入力内容が大きすぎます" }, 413);
  const input = JSON.parse(raw) as Record<string, unknown>;
  const event = sanitizeEvent(input.event);
  if (!event) return responseJson({ error: "イベントの入力内容を確認してください" }, 400);
  if (event.date < japanDateKey()) return responseJson({ error: "開催日は本日以降に設定してください" }, 400);
  const elevated = isElevated(member);
  const admin = isAdmin(member);
  if (event.eventType === "official" && !elevated)
    return responseJson({ error: "公式イベントは運営メンバーのみ作成できます" }, 403);
  if (event.eventType === "club" && !await canMemberAccessClub(db, event.clubId!, member.id, admin))
    return responseJson({ error: "部活イベントは所属部員または部長のみ作成できます" }, 403);
  const privateMemo = text(input.privateMemo, 5000) || null;
  const id = `event_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO events
      (id, organizer_member_id, event_type, club_id, event_date, status, title, public_data_json, private_memo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`)
      .bind(id, member.id, event.eventType, event.clubId ?? null, event.date, event.title, JSON.stringify(event), privateMemo, now, now),
    db.prepare(`INSERT INTO audit_logs
      (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (?, 'event.created', 'event', ?, ?, ?)`)
      .bind(String(member.id), id, JSON.stringify({ eventType: event.eventType }), now),
  ]);
  // 公式イベントの主担当は対象外。その他のイベントは作成時に一度だけ付与する。
  // サーバー側で確定し、画面遷移・通信の再試行で重複しないようにする。
  if (event.eventType !== "official") {
    await awardEventReward(db, {
      eventId: id,
      memberId: member.id,
      action: "event_created",
      amount: EVENT_XP.created,
      now,
    });
  }
  const row = await db.prepare(`${selectEvents} WHERE e.id = ?`).bind(id).first<EventRow>();
  return responseJson({ event: await hydratedEvent(db, row!, member.id, elevated) }, 201);
}

async function uploadImage(request: Request, env: SitesEnv, memberId: number) {
  if (!env.UPLOADS) return responseJson({ error: "画像保存先に接続できません" }, 503);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) return responseJson({ error: "画像は8MB以内にしてください" }, 413);
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0];
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(contentType))
    return responseJson({ error: "JPEG・PNG・WebP・GIF画像を選択してください" }, 415);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES)
    return responseJson({ error: "画像は8MB以内にしてください" }, 413);
  const extension = contentType.split("/")[1].replace("jpeg", "jpg");
  const key = `events/${memberId}/${crypto.randomUUID()}.${extension}`;
  await env.UPLOADS.put(key, bytes, { httpMetadata: { contentType } });
  return responseJson({ imageUrl: `/api/event-images/${encodeURIComponent(key)}` }, 201);
}

export async function handleEventRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const eventMatch = EVENT_PATH.exec(pathname);
  const favoriteMatch = EVENT_FAVORITE_PATH.exec(pathname);
  const applicationMatch = EVENT_APPLICATION_PATH.exec(pathname);
  const finalizeMatch = EVENT_FINALIZE_PATH.exec(pathname);
  const participantMatch = EVENT_PARTICIPANT_PATH.exec(pathname);
  const cancellationMatch = EVENT_CANCELLATION_PATH.exec(pathname);
  const cancellationReviewMatch = EVENT_CANCELLATION_REVIEW_PATH.exec(pathname);
  const imageMatch = EVENT_IMAGE_PATH.exec(pathname);
  const attendanceMatch = EVENT_ATTENDANCE_PATH.exec(pathname);
  const cancellationPreviewMatch = EVENT_CANCELLATION_PREVIEW_PATH.exec(pathname);
  if (pathname !== EVENTS_ENDPOINT && !eventMatch && !favoriteMatch && !applicationMatch && !finalizeMatch && !participantMatch && !cancellationMatch && !cancellationReviewMatch && !attendanceMatch && !cancellationPreviewMatch && !imageMatch && pathname !== "/api/event-images") return null;
  if (!env.DB) return responseJson({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return responseJson({ error: "ログインが必要です" }, 401);
  const elevated = isElevated(member);
  const admin = isAdmin(member);
  const memberPublicId = await viewerPublicId(env.DB, member.id);

  if (pathname === "/api/event-images" && request.method === "POST")
    return uploadImage(request, env, member.id);
  if (imageMatch && request.method === "GET") {
    if (!env.UPLOADS) return responseJson({ error: "画像保存先に接続できません" }, 503);
    const key = decodeURIComponent(imageMatch[1]);
    if (!key.startsWith("events/")) return responseJson({ error: "not found" }, 404);
    const object = await env.UPLOADS.get(key);
    if (!object) return responseJson({ error: "not found" }, 404);
    return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "application/octet-stream", "cache-control": "private, max-age=86400" } });
  }
  if (pathname === EVENTS_ENDPOINT && request.method === "POST")
    return createEvent(request, env.DB, member);
  if (pathname === EVENTS_ENDPOINT && request.method === "GET") {
    const includeCancelled = url.searchParams.get("includeCancelled") === "1";
    // 旧プレビューで作成したテストイベントは、リリース版へ持ち込まない。
    for (const title of DEPRECATED_TEST_EVENT_TITLES) {
      await env.DB.prepare("DELETE FROM events WHERE title = ?").bind(title).run();
    }
    await env.DB.prepare("DELETE FROM events WHERE title LIKE '%テスト%'").run();
    const rows = await env.DB.prepare(`${selectEvents} ${includeCancelled ? "" : "WHERE e.status != 'cancelled'"} ORDER BY e.event_date, e.created_at DESC`).all<EventRow>();
    const events = await Promise.all((rows.results ?? []).filter((row) => !DELETED_EVENT_IDS.has(row.id)).map(async (row) => {
      if (row.event_type === "club" && row.club_id && !await canMemberAccessClub(env.DB!, row.club_id, member.id, admin))
        return lockedClubEventPreview(row);
      return hydratedEvent(env.DB!, row, member.id, elevated, memberPublicId);
    }));
    return responseJson({ events });
  }
  if (eventMatch && request.method === "GET") {
    const requestedEventId = decodeURIComponent(eventMatch[1]);
    if (DELETED_EVENT_IDS.has(requestedEventId)) return responseJson({ error: "イベントが見つかりません" }, 404);
    const row = await eventRow(env.DB, requestedEventId);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    if (row.event_type === "club" && row.club_id && !await canMemberAccessClub(env.DB, row.club_id, member.id, admin))
      return responseJson({ error: "この部活の部員のみ詳細を閲覧できます" }, 403);
    return responseJson({ event: await hydratedEvent(env.DB, row, member.id, elevated, memberPublicId) });
  }
  if (eventMatch && request.method === "PATCH") {
    const id = decodeURIComponent(eventMatch[1]);
    const row = await eventRow(env.DB, id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    const input = await readBody(request);
    if (input?.action === "start_recruitment") {
      if (!admin) return responseJson({ error: "募集開始は管理者のみ実行できます" }, 403);
      if (row.event_type !== "official") return responseJson({ error: "公式イベントのみ募集を開始できます" }, 400);
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
      if (data.recruitmentStatus !== "draft") return responseJson({ event: await hydratedEvent(env.DB, row, member.id, elevated, memberPublicId) });
      data.recruitmentStatus = "open";
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("UPDATE events SET public_data_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(data), now, id),
        env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
          VALUES (?, 'event.recruitment_started', 'event', ?, '{}', ?)`).bind(String(member.id), id, now),
      ]);
      const updated = await eventRow(env.DB, id);
      return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId) });
    }
    if (input?.action === "update_companions") {
      if (!(admin || row.organizer_member_id === member.id)) return responseJson({ error: "イベント作成者または管理者のみ同席者を変更できます" }, 403);
      const companionIds = stringArray(input.companionIds, 100, 40);
      if (companionIds === null) return responseJson({ error: "同席者の内容が不正です" }, 400);
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
      data.companionIds = companionIds;
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("UPDATE events SET public_data_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(data), now, id),
        env.DB.prepare(`INSERT INTO event_import_field_edits (event_id, field_name, edited_at, actor_member_id)
          VALUES (?, 'companionIds', ?, ?) ON CONFLICT(event_id, field_name) DO UPDATE SET edited_at = excluded.edited_at, actor_member_id = excluded.actor_member_id`).bind(id, now, member.id),
        env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
          VALUES (?, 'event.companions_edited', 'event', ?, ?, ?)`).bind(String(member.id), id, JSON.stringify({ companionCount: companionIds.length }), now),
      ]);
      const updated = await eventRow(env.DB, id);
      return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId) });
    }
    if (input?.action === "edit") {
      if (!(admin || row.organizer_member_id === member.id)) return responseJson({ error: "イベント作成者または管理者のみイベント情報を編集できます" }, 403);
      const title = text(input.title, 160, true);
      const description = text(input.description, 5000);
      const participants = stringArray(input.participants, 100, 80) ?? [];
      const date = input.date === undefined ? undefined : text(input.date, 10, true);
      const time = input.time === undefined ? undefined : text(input.time, 5, true);
      const location = input.location === undefined ? undefined : text(input.location, 500, true);
      const capacity = input.capacity === undefined ? undefined : number(input.capacity, 1, 100);
      const reservationCapacity = input.reservationCapacity === undefined ? undefined : number(input.reservationCapacity, 1, 101);
      const price = input.price === undefined ? undefined : text(input.price, 80);
      const priceMin = input.priceMin === undefined ? undefined : number(input.priceMin, 0, 300_000);
      const priceMax = input.priceMax === undefined ? undefined : number(input.priceMax, 0, 300_000);
      const applicationDeadline = input.applicationDeadline === undefined ? undefined : text(input.applicationDeadline, 10);
      const cancellationPolicy = input.cancellationPolicy === undefined ? undefined : text(input.cancellationPolicy, 2000);
      const tabelogUrl = input.tabelogUrl === undefined ? undefined : text(input.tabelogUrl, 500);
      const googleMapsUrl = input.googleMapsUrl === undefined ? undefined : text(input.googleMapsUrl, 500);
      const eventType = input.eventType === undefined ? row.event_type : ["official", "gourmet", "club"].includes(String(input.eventType)) ? String(input.eventType) as EventRow["event_type"] : null;
      const clubId = input.clubId === undefined ? row.club_id : text(input.clubId, 80);
      const restaurantName = input.restaurantName === undefined ? undefined : text(input.restaurantName, 160);
      const image = input.image === undefined ? undefined : text(input.image, 500, true);
      const genres = input.genres === undefined ? undefined : stringArray(input.genres, 20);
      const companionIds = input.companionIds === undefined ? undefined : stringArray(input.companionIds, 100, 40);
      const rankPrices = input.rankPrices === undefined ? undefined : input.rankPrices && typeof input.rankPrices === "object" ? input.rankPrices : null;
      const selectionMethod = input.selectionMethod === undefined ? undefined : input.selectionMethod === "lottery" ? "lottery" : input.selectionMethod === "first_come" ? "first_come" : null;
      const category = input.category === undefined ? undefined : ["all", "kanto", "kansai"].includes(String(input.category)) ? input.category : null;
      const prefecture = input.prefecture === undefined ? undefined : text(input.prefecture, 16);
      const tokyoArea = input.tokyoArea === undefined ? undefined : text(input.tokyoArea, 80);
      const publicNotes = input.publicNotes === undefined ? undefined : text(input.publicNotes, 5000);
      const privateMemo = input.privateMemo === undefined ? undefined : text(input.privateMemo, 5000);
      if (!title || description === null || (date !== undefined && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) || (time !== undefined && (typeof time !== "string" || !/^([01]\d|2[0-3]):(00|15|30|45)$/.test(time))) || location === null || capacity === null || reservationCapacity === null || price === null || priceMin === null || priceMax === null || applicationDeadline === null || cancellationPolicy === null || tabelogUrl === null || googleMapsUrl === null || !eventType || clubId === null || restaurantName === null || (image !== undefined && (!image || !image.startsWith("/api/event-images/"))) || genres === null || companionIds === null || rankPrices === null || selectionMethod === null || category === null || prefecture === null || tokyoArea === null || publicNotes === null || privateMemo === null)
        return responseJson({ error: "変更内容が不正です" }, 400);
      if (eventType === "official" && !elevated) return responseJson({ error: "公式イベントは運営メンバーのみ設定できます" }, 403);
      if (eventType === "club" && (!clubId || !await canMemberAccessClub(env.DB, clubId, member.id, admin))) return responseJson({ error: "所属している部活動のみ設定できます" }, 403);
      if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) return responseJson({ error: "予算の範囲が不正です" }, 400);
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
      data.description = description;
      data.manualParticipantIds = participants;
      if (time !== undefined) data.time = time;
      if (location !== undefined) data.location = location;
      if (capacity !== undefined) data.capacity = capacity;
      if (reservationCapacity !== undefined) data.reservationCapacity = reservationCapacity;
      if (price !== undefined) data.price = price;
      if (priceMin !== undefined) data.priceMin = priceMin;
      if (priceMax !== undefined) data.priceMax = priceMax;
      if (applicationDeadline !== undefined) data.applicationDeadline = applicationDeadline;
      if (cancellationPolicy !== undefined) data.cancellationPolicy = cancellationPolicy;
      if (tabelogUrl !== undefined) data.tabelogUrl = tabelogUrl || undefined;
      if (googleMapsUrl !== undefined) data.googleMapsUrl = googleMapsUrl || undefined;
      if (restaurantName !== undefined) data.restaurantName = restaurantName || undefined;
      if (image !== undefined) data.image = image;
      if (genres !== undefined) data.genres = genres;
      if (companionIds !== undefined) data.companionIds = companionIds;
      if (rankPrices !== undefined) data.rankPrices = rankPrices;
      if (selectionMethod !== undefined) data.selectionMethod = selectionMethod;
      if (category !== undefined) data.category = category;
      if (prefecture !== undefined) data.prefecture = prefecture || undefined;
      if (tokyoArea !== undefined) data.tokyoArea = tokyoArea || undefined;
      if (publicNotes !== undefined) data.publicNotes = publicNotes || undefined;
      const effectiveDate = date ?? row.event_date;
      const effectiveTime = time ?? (typeof data.time === "string" && /^\d{2}:\d{2}$/.test(data.time) ? data.time : "00:00");
      const reopensFutureEvent = row.status === "ended" && new Date(`${effectiveDate}T${effectiveTime}:00+09:00`).getTime() > Date.now();
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("UPDATE events SET title = ?, event_type = ?, club_id = ?, event_date = ?, status = ?, public_data_json = ?, private_memo = COALESCE(?, private_memo), updated_at = ? WHERE id = ?").bind(title, eventType, eventType === "club" ? clubId : null, effectiveDate, reopensFutureEvent ? "open" : row.status, JSON.stringify(data), privateMemo, now, id),
        ...["title", "description", "eventType", "clubId", "restaurantName", "image", "genres", "companionIds", "rankPrices", "selectionMethod", "category", "prefecture", "tokyoArea", "publicNotes", "privateMemo", "event_date", "time", "location", "capacity", "reservationCapacity", "price", "priceMin", "priceMax", "applicationDeadline", "cancellationPolicy", "tabelogUrl", "googleMapsUrl", "manualParticipantIds"].map((field) => env.DB!.prepare(`INSERT INTO event_import_field_edits (event_id, field_name, edited_at, actor_member_id)
          VALUES (?, ?, ?, ?) ON CONFLICT(event_id, field_name) DO UPDATE SET edited_at = excluded.edited_at, actor_member_id = excluded.actor_member_id`).bind(id, field, now, member.id)),
        env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
          VALUES (?, 'event.edited', 'event', ?, ?, ?)`).bind(String(member.id), id, JSON.stringify({ participants: participants.length }), now),
      ]);
      const updated = await eventRow(env.DB, id);
      return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId) });
    }
    if (!(admin || row.organizer_member_id === member.id)) return responseJson({ error: "イベント作成者または管理者のみ操作できます" }, 403);
    if (input?.action !== "cancel") return responseJson({ error: "操作を選択してください" }, 400);
    if (input?.confirmedParticipantNotified !== true) return responseJson({ error: "参加確定者への事前連絡の確認が必要です" }, 400);
    if (row.status === "cancelled") return responseJson({ success: true, cancelled: true });
    const now = new Date().toISOString();
    await reverseCancelledEventHostXp(env.DB, id, now);
    await reverseEventRewards(env.DB, id, now);
    const pointUsers = await env.DB.prepare("SELECT member_id FROM event_point_usages WHERE event_id = ? AND status = 'applied'")
      .bind(id).all<{ member_id: number }>();
    for (const pointUser of pointUsers.results ?? []) await refundEventPointDiscount(env.DB, id, pointUser.member_id, row.title, now);
    await env.DB.batch([
      env.DB.prepare("UPDATE events SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(now, id),
      env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, 'event.cancelled', 'event', ?, '{}', ?)`).bind(String(member.id), id, now),
    ]);
    await postEventCancellationToConfirmedChat(env.DB, row, member.id, now);
    return responseJson({ success: true, cancelled: true });
  }
  if (eventMatch && request.method === "DELETE") {
    const id = decodeURIComponent(eventMatch[1]);
    const row = await eventRow(env.DB, id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    if (!admin) return responseJson({ error: "イベントの削除は管理者のみ実行できます" }, 403);
    const now = new Date().toISOString();
    // event_id の外部キーは ON DELETE CASCADE。中止と異なり履歴も含めて完全に削除する。
    await env.DB.batch([
      env.DB.prepare("DELETE FROM events WHERE id = ?").bind(id),
      env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, 'event.deleted', 'event', ?, ?, ?)`).bind(String(member.id), id, JSON.stringify({ title: row.title }), now),
    ]);
    return responseJson({ success: true });
  }
  if (favoriteMatch && request.method === "PUT") {
    const id = decodeURIComponent(favoriteMatch[1]);
    const row = await eventRow(env.DB, id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    if (row.event_type === "club" && row.club_id && !await canMemberAccessClub(env.DB, row.club_id, member.id, admin))
      return responseJson({ error: "この部活の部員のみお気に入り登録できます" }, 403);
    const input = await readBody(request);
    if (typeof input?.favorite !== "boolean") return responseJson({ error: "入力内容を確認してください" }, 400);
    if (input.favorite) {
      await env.DB.prepare(`INSERT INTO event_favorites (event_id, member_id, created_at) VALUES (?, ?, ?)
        ON CONFLICT(event_id, member_id) DO NOTHING`).bind(id, member.id, new Date().toISOString()).run();
    } else {
      await env.DB.prepare("DELETE FROM event_favorites WHERE event_id = ? AND member_id = ?").bind(id, member.id).run();
    }
    return responseJson({ success: true, favorite: input.favorite });
  }
  if (applicationMatch && request.method === "POST") {
    const id = decodeURIComponent(applicationMatch[1]);
    const row = await eventRow(env.DB, id);
    if (!row) return responseJson({ error: "現在、このイベントには申し込めません" }, 409);
    let existingData: Record<string, unknown> = {};
    try { existingData = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
    if (existingData.recruitmentStatus === "draft") return responseJson({ error: "この公式イベントはまだ募集開始前です" }, 409);
    const recruitmentFinalized = typeof existingData.participantsFinalizedAt === "string" && existingData.participantsFinalizedAt.length > 0;
    if (row.status !== "open" && recruitmentFinalized) return responseJson({ error: "現在、このイベントには申し込めません" }, 409);
    if (row.event_type === "club" && row.club_id && !await canMemberAccessClub(env.DB, row.club_id, member.id, admin))
      return responseJson({ error: "この部活の部員のみ参加申込できます" }, 403);
    if (row.organizer_member_id === member.id) return responseJson({ error: "幹事は参加申込できません" }, 409);
    const restricted = await currentRestriction(env.DB, member.id, new Date().toISOString());
    if (restricted) return responseJson({ error: `ペナルティにより${restricted.ends_at.replace("T", " ").slice(0, 16)}まで新規申込はできません` }, 403);
    const input = await readBody(request);
    if (input?.termsAccepted !== true) return responseJson({ error: "イベント参加規約への同意が必要です" }, 400);
    let data: Record<string, unknown> = existingData;
    const deadline = typeof data.applicationDeadline === "string" ? data.applicationDeadline : "";
    const today = new Date().toISOString().slice(0, 10);
    if (deadline && deadline < today) return responseJson({ error: "参加申込の受付期間は終了しました" }, 409);
    const capacity = typeof data.capacity === "number" ? data.capacity : 0;
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM event_participations
      WHERE event_id = ? AND status IN ('confirmed', 'cancel_requested')`).bind(id).first<{ count: number }>();
    const immediate = row.event_type === "official" && data.selectionMethod !== "lottery";
    if (immediate && (count?.count ?? 0) >= capacity) return responseJson({ error: "満席です" }, 409);
    const now = new Date().toISOString();
    const status = immediate ? "confirmed" : "applied";
    const requestedPoints = Number(input?.pointsToUse ?? 0);
    if (!Number.isInteger(requestedPoints) || requestedPoints < 0 || requestedPoints > 300_000)
      return responseJson({ error: "利用ポイントを確認してください" }, 400);
    if (requestedPoints > 0 && row.event_type !== "official")
      return responseJson({ error: "イロタスポイントは公式イベントの参加費にのみ利用できます" }, 400);
    const rankRow = await env.DB.prepare("SELECT member_rank FROM members WHERE id = ?").bind(member.id).first<{ member_rank: string }>();
    const rankPrices = data.rankPrices && typeof data.rankPrices === "object" ? data.rankPrices as Record<string, unknown> : {};
    const eventPrice = priceNumber(rankPrices[rankRow?.member_rank ?? "regular"] ?? data.price);
    if (requestedPoints > eventPrice) return responseJson({ error: "参加費を超えるポイントは利用できません" }, 400);
    let pointResult: Awaited<ReturnType<typeof applyEventPointDiscount>> | null = null;
    if (requestedPoints > 0) {
      pointResult = await applyEventPointDiscount(env.DB, id, member.id, requestedPoints, row.title, now);
      if (!pointResult.success) return responseJson({ error: "イロタスポイント残高が不足しています" }, 409);
    }
    if (immediate && !(typeof data.chatId === "string" && data.chatId)) data.chatId = eventChatId(id);
    try {
      await env.DB.prepare(`INSERT INTO event_participations
        (event_id, member_id, status, terms_accepted_at, applied_at, confirmed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id, member_id) DO UPDATE SET status = excluded.status,
          terms_accepted_at = excluded.terms_accepted_at, applied_at = excluded.applied_at,
          confirmed_at = excluded.confirmed_at, cancelled_at = NULL, updated_at = excluded.updated_at`)
        .bind(id, member.id, status, now, now, immediate ? now : null, now).run();
    } catch (error) {
      if (pointResult && !pointResult.duplicate) await refundEventPointDiscount(env.DB, id, member.id, row.title, now);
      throw error;
    }
    if (immediate) {
      await env.DB.prepare("UPDATE events SET public_data_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(data), now, id).run();
      await notifyEventConfirmation(env.DB, member.id, id, row.title);
    }
    await audit(env.DB, member.id, "event.application_submitted", id, { status });
    const updated = await eventRow(env.DB, id);
    return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId), pointBalance: pointResult?.balance ?? null, pointsUsed: pointResult?.amount ?? 0 }, 201);
  }
  if (finalizeMatch && request.method === "POST") {
    const id = decodeURIComponent(finalizeMatch[1]);
    const row = await eventRow(env.DB, id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    if (!(elevated || row.organizer_member_id === member.id)) return responseJson({ error: "幹事または運営メンバーのみ操作できます" }, 403);
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
    if (typeof data.participantsFinalizedAt === "string" && data.participantsFinalizedAt) {
      return responseJson({ event: await hydratedEvent(env.DB, row, member.id, elevated, memberPublicId) });
    }
    const now = new Date().toISOString();
    const chatId = typeof data.chatId === "string" && data.chatId ? data.chatId : eventChatId(id);
    data.chatId = chatId;
    data.participantsFinalizedAt = now;
    const confirmed = await env.DB.prepare("SELECT member_id FROM event_participations WHERE event_id = ? AND status IN ('confirmed','cancel_requested')").bind(id).all<{ member_id: number }>();
    const companionPublicIds = stringArray(data.companionIds, 100, 40) ?? [];
    const companionMemberIds = new Set<number>();
    for (const companionPublicId of companionPublicIds) {
      const companionMemberId = await memberIdFromPublicId(env.DB, companionPublicId);
      if (companionMemberId && companionMemberId !== row.organizer_member_id) companionMemberIds.add(companionMemberId);
    }
    const chatMemberIds = new Set([...(confirmed.results ?? []).map((participant) => participant.member_id), ...companionMemberIds]);
    const chatMemberNames = await Promise.all([...chatMemberIds].map(async (memberId) => ({ memberId, name: await eventChatMemberName(env.DB!, memberId) })));
    const pendingApplicants = await env.DB.prepare("SELECT member_id FROM event_participations WHERE event_id = ? AND status = 'applied'").bind(id).all<{ member_id: number }>();
    await env.DB.batch([
      env.DB.prepare("UPDATE events SET public_data_json = ?, status = 'full', updated_at = ? WHERE id = ?").bind(JSON.stringify(data), now, id),
      env.DB.prepare("UPDATE event_participations SET status = 'rejected', cancelled_at = ?, updated_at = ? WHERE event_id = ? AND status = 'applied'").bind(now, now, id),
      env.DB.prepare(`INSERT OR IGNORE INTO chat_rooms (id, name, room_type, source_id, created_by_member_id, created_at, updated_at)
        VALUES (?, ?, 'event', ?, ?, ?, ?)`).bind(chatId, row.title, id, row.organizer_member_id, now, now),
      env.DB.prepare(`INSERT INTO chat_room_members (room_id, member_id, member_role, joined_at, left_at) VALUES (?, ?, 'owner', ?, NULL)
        ON CONFLICT(room_id, member_id) DO UPDATE SET member_role = 'owner', left_at = NULL`)
        .bind(chatId, row.organizer_member_id, now),
      ...[...chatMemberIds].map((memberId) => env.DB!.prepare(`INSERT INTO chat_room_members (room_id, member_id, member_role, joined_at, left_at) VALUES (?, ?, 'member', ?, NULL)
        ON CONFLICT(room_id, member_id) DO UPDATE SET left_at = NULL`)
        .bind(chatId, memberId, now)),
      env.DB.prepare(`INSERT OR IGNORE INTO chat_messages (id, room_id, sender_member_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(`event-chat-welcome:${id}`, chatId, row.organizer_member_id, eventChatSystemContent(`「${row.title}」の参加者専用グループが作成されました`), now, now),
      ...chatMemberNames.map(({ memberId, name }) => env.DB!.prepare(`INSERT OR IGNORE INTO chat_messages (id, room_id, sender_member_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(`event-chat-join:${id}:${memberId}`, chatId, row.organizer_member_id, eventChatSystemContent(`${name}がチャットに参加しました`), now, now)),
      env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, 'event.participants_finalized', 'event', ?, ?, ?)`).bind(String(member.id), id, JSON.stringify({ chatId, count: confirmed.results?.length ?? 0, companionCount: companionMemberIds.size }), now),
    ]);
    for (const participant of confirmed.results ?? []) await notifyEventConfirmation(env.DB, participant.member_id, id, row.title);
    for (const companionMemberId of companionMemberIds) await notifyEventConfirmation(env.DB, companionMemberId, id, row.title);
    const start = new Date(`${row.event_date}T${String(data.time ?? "00:00")}:00`);
    const startLabel = Number.isNaN(start.getTime()) ? `${row.event_date} ${String(data.time ?? "")}` : `${start.getMonth() + 1}月${start.getDate()}日 ${String(data.time ?? "")}`;
    for (const applicant of pendingApplicants.results ?? []) await notifyEventCancellation(
      env.DB,
      applicant.member_id,
      id,
      "イベントの募集が終了しました",
      `応募していた${startLabel}「${row.title}」のイベントの募集が終了しました。`,
    );
    const updated = await eventRow(env.DB, id);
    return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId) });
  }
  if (participantMatch && request.method === "PATCH") {
    const id = decodeURIComponent(participantMatch[1]);
    const targetPublicId = decodeURIComponent(participantMatch[2]);
    const row = await eventRow(env.DB, id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    if (!(elevated || row.organizer_member_id === member.id)) return responseJson({ error: "幹事または運営メンバーのみ操作できます" }, 403);
    const targetId = await memberIdFromPublicId(env.DB, targetPublicId);
    if (!targetId) return responseJson({ error: "メンバーが見つかりません" }, 404);
    const input = await readBody(request);
    if (input?.action !== "approve" && input?.action !== "cancel") return responseJson({ error: "操作を選択してください" }, 400);
    const now = new Date().toISOString();
    if (input.action === "approve") {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
      const participation = await env.DB.prepare("SELECT status FROM event_participations WHERE event_id = ? AND member_id = ?")
        .bind(id, targetId).first<{ status: string }>();
      if (!participation || !["applied", "cancelled", "rejected"].includes(participation.status))
        return responseJson({ error: "承認可能な参加申込が見つかりません" }, 409);
      const capacity = typeof data.capacity === "number" ? data.capacity : 0;
      const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM event_participations WHERE event_id = ? AND status IN ('confirmed','cancel_requested')`).bind(id).first<{ count: number }>();
      if ((count?.count ?? 0) >= capacity) return responseJson({ error: "満席のため承認できません" }, 409);
      await env.DB.prepare(`UPDATE event_participations SET status = 'confirmed', confirmed_at = ?, cancelled_at = NULL, updated_at = ?
        WHERE event_id = ? AND member_id = ? AND status IN ('applied','cancelled','rejected')`).bind(now, now, id, targetId).run();
      const chatId = typeof data.chatId === "string" && data.chatId ? data.chatId : eventChatId(id);
      data.chatId = chatId;
      const targetName = await eventChatMemberName(env.DB, targetId);
      await env.DB.prepare("UPDATE events SET public_data_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(data), now, id).run();
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO chat_rooms (id, name, room_type, source_id, created_by_member_id, created_at, updated_at)
          VALUES (?, ?, 'event', ?, ?, ?, ?)`).bind(chatId, row.title, id, row.organizer_member_id, now, now),
        env.DB.prepare(`INSERT INTO chat_room_members (room_id, member_id, member_role, joined_at, left_at)
          VALUES (?, ?, 'owner', ?, NULL)
          ON CONFLICT(room_id, member_id) DO UPDATE SET member_role = 'owner', left_at = NULL`)
          .bind(chatId, row.organizer_member_id, now),
        env.DB.prepare(`INSERT INTO chat_room_members (room_id, member_id, member_role, joined_at, left_at)
          VALUES (?, ?, 'member', ?, NULL)
          ON CONFLICT(room_id, member_id) DO UPDATE SET left_at = NULL`)
          .bind(chatId, targetId, now),
        env.DB.prepare(`INSERT OR IGNORE INTO chat_messages (id, room_id, sender_member_id, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(`event-chat-welcome:${id}`, chatId, row.organizer_member_id, eventChatSystemContent(`「${row.title}」の参加者専用グループが作成されました`), now, now),
        env.DB.prepare(`INSERT OR IGNORE INTO chat_messages (id, room_id, sender_member_id, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(`event-chat-join:${id}:${targetId}`, chatId, row.organizer_member_id, eventChatSystemContent(`${targetName}がチャットに参加しました`), now, now),
      ]);
      await notifyEventConfirmation(env.DB, targetId, id, row.title);
    } else {
      await env.DB.prepare(`UPDATE event_participations SET status = 'cancelled', cancelled_at = ?, updated_at = ?
        WHERE event_id = ? AND member_id = ?`).bind(now, now, id, targetId).run();
      await env.DB.prepare("UPDATE events SET status = 'open', updated_at = ? WHERE id = ? AND status = 'full' AND COALESCE(json_extract(public_data_json, '$.participantsFinalizedAt'), '') = ''").bind(now, id).run();
      await refundEventPointDiscount(env.DB, id, targetId, row.title, now);
      await notifyOrganizerParticipantCancellation(env.DB, row, targetId, member.id, now);
    }
    await audit(env.DB, member.id, input.action === "approve" ? "event.participant_confirmed" : "event.participant_cancelled", id, { targetId });
    const updated = await eventRow(env.DB, id);
    return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId) });
  }
  if (attendanceMatch) {
    const id = decodeURIComponent(attendanceMatch[1]);
    const row = await eventRow(env.DB, id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    if (!(elevated || row.organizer_member_id === member.id)) return responseJson({ error: "幹事または運営メンバーのみ操作できます" }, 403);
    const start = eventStart(row);
    const attendanceAvailableAt = start ? start.getTime() + 3 * 60 * 60 * 1000 : null;
    if (!attendanceAvailableAt || Date.now() < attendanceAvailableAt)
      return responseJson({ error: "開始日時の3時間後から実出欠を確定できます" }, 409);
    const participants = await env.DB.prepare(`SELECT p.member_id, m.public_member_id, m.display_name, m.member_rank
      FROM event_participations p JOIN members m ON m.id = p.member_id
      WHERE p.event_id = ? AND p.status = 'confirmed' ORDER BY p.confirmed_at, p.member_id`).bind(id).all<{ member_id: number; public_member_id: string | null; display_name: string | null; member_rank: string | null }>();
    const finalized = await env.DB.prepare("SELECT finalized_at, actual_attendee_count FROM event_attendance_finalizations WHERE event_id = ?")
      .bind(id).first<{ finalized_at: string; actual_attendee_count: number }>();
    const attendance = await env.DB.prepare("SELECT member_id, status FROM event_attendance_confirmations WHERE event_id = ?")
      .bind(id).all<{ member_id: number; status: "attended" | "absent" }>();
    const attendanceByMember = new Map((attendance.results ?? []).map((item) => [item.member_id, item.status]));
    if (request.method === "GET") return responseJson({ finalized: Boolean(finalized), finalizedAt: finalized?.finalized_at ?? null, actualAttendeeCount: finalized?.actual_attendee_count ?? null, canCorrect: Boolean(finalized && elevated), participants: (participants.results ?? []).map((participant) => ({ memberId: participant.public_member_id ?? `member-${participant.member_id}`, name: participant.display_name ?? "メンバー", rank: participant.member_rank ?? "regular", status: attendanceByMember.get(participant.member_id) ?? "attended" })) });
    if (request.method !== "PUT") return responseJson({ error: "method_not_allowed" }, 405);
    const input = await readBody(request);
    const correcting = Boolean(finalized);
    if (correcting && !elevated) return responseJson({ error: "実出欠は確定済みです。訂正は管理者のみ行えます" }, 409);
    const absentIds = new Set(stringArray(input?.absentMemberIds, 100, 100) ?? []);
    const actual = (participants.results ?? []).filter((participant) => !absentIds.has(participant.public_member_id ?? `member-${participant.member_id}`));
    const now = new Date().toISOString();
    if (correcting) {
      await reverseEventRewards(env.DB, id, now, ["event_completed_host", "event_attendance_bonus", "event_attendance", "event_feedback"]);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM event_attendance_confirmations WHERE event_id = ?").bind(id),
        env.DB.prepare("DELETE FROM event_attendance_finalizations WHERE event_id = ?").bind(id),
      ]);
    }
    await env.DB.batch([
      ...(participants.results ?? []).map((participant) => env.DB!.prepare(`INSERT INTO event_attendance_confirmations
        (event_id,member_id,status,confirmed_by_member_id,confirmed_at,updated_at) VALUES (?,?,?,?,?,?)`)
        .bind(id, participant.member_id, absentIds.has(participant.public_member_id ?? `member-${participant.member_id}`) ? "absent" : "attended", member.id, now, now)),
      env.DB.prepare(`INSERT INTO event_attendance_finalizations (event_id,finalized_by_member_id,finalized_at,actual_attendee_count,corrected_at,corrected_by_member_id)
        VALUES (?,?,?,?,?,?)`).bind(id, member.id, now, actual.length, correcting ? now : null, correcting ? member.id : null),
    ]);
    if (row.event_type !== "official") {
      await awardEventReward(env.DB, { eventId: id, memberId: row.organizer_member_id, action: "event_completed_host", amount: EVENT_XP.completedHost, now });
      const bonus = actual.length >= 8 ? EVENT_XP.attendanceBonus8 : actual.length >= 4 ? EVENT_XP.attendanceBonus4 : 0;
      if (bonus) await awardEventReward(env.DB, { eventId: id, memberId: row.organizer_member_id, action: "event_attendance_bonus", amount: bonus, now });
    }
    for (const participant of actual) {
      if (participant.member_id !== row.organizer_member_id) await awardEventReward(env.DB, { eventId: id, memberId: participant.member_id, action: "event_attendance", amount: EVENT_XP.attendance, now });
    }
    await audit(env.DB, member.id, correcting ? "event.attendance_corrected" : "event.attendance_finalized", id, { actualAttendeeCount: actual.length, absentMemberIds: [...absentIds] });
    return responseJson({ success: true, corrected: correcting, actualAttendeeCount: actual.length });
  }
  if (cancellationPreviewMatch && request.method === "GET") {
    const id = decodeURIComponent(cancellationPreviewMatch[1]);
    const row = await eventRow(env.DB, id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    const now = new Date().toISOString();
    const summary = await activePenaltySummary(env.DB, member.id, now);
    const restriction = await currentRestriction(env.DB, member.id, now);
    const applies = isLateCancellation(row, new Date(now));
    return responseJson({ applies, cutoffAt: lateCancellationCutoff(row).toISOString(), activePoints: summary.activePoints, pointsAfterCancellation: summary.activePoints + (applies ? 1 : 0), earliestExpiry: summary.earliestExpiry, restrictionUntil: restriction?.ends_at ?? (applies && summary.activePoints + 1 >= 3 ? nextMonthSameTokyoTime(now) : null) });
  }
  if (cancellationMatch && request.method === "POST") {
    const id = decodeURIComponent(cancellationMatch[1]);
    const row = await eventRow(env.DB, id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    const input = await readBody(request);
    const participation = await env.DB.prepare("SELECT status FROM event_participations WHERE event_id = ? AND member_id = ?").bind(id, member.id).first<{ status: string }>();
    const now = new Date().toISOString();
    if (participation?.status === "applied") {
      await env.DB.prepare("UPDATE event_participations SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE event_id = ? AND member_id = ? AND status = 'applied'")
        .bind(now, now, id, member.id).run();
      await audit(env.DB, member.id, "event.application_cancelled", id);
      return responseJson({ event: await hydratedEvent(env.DB, row, member.id, elevated, memberPublicId) }, 201);
    }
    if (input?.contactedOrganizer !== true || input?.policyConfirmed !== true)
      return responseJson({ error: "幹事への連絡とキャンセルポリシーの確認が必要です" }, 400);
    if (participation?.status !== "confirmed") return responseJson({ error: "参加確定者のみキャンセル申請できます" }, 409);
    const pending = await env.DB.prepare("SELECT id FROM event_cancellation_requests WHERE event_id = ? AND member_id = ? AND status = 'pending'").bind(id, member.id).first<{ id: string }>();
    if (pending) return responseJson({ error: "すでにキャンセル申請中です" }, 409);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO event_cancellation_requests
        (id, event_id, member_id, contacted_organizer, policy_confirmed, status, requested_at, late_cancellation_at)
        VALUES (?, ?, ?, 1, 1, 'pending', ?, ?)`).bind(`cancel_${crypto.randomUUID()}`, id, member.id, now, isLateCancellation(row, new Date(now)) ? now : null),
      env.DB.prepare("UPDATE event_participations SET status = 'cancel_requested', updated_at = ? WHERE event_id = ? AND member_id = ?").bind(now, id, member.id),
    ]);
    await audit(env.DB, member.id, "event.cancellation_requested", id);
    await notifyEventCancellation(
      env.DB,
      row.organizer_member_id,
      id,
      "イベントのキャンセル申請が届きました",
      `「${row.title}」の参加者からキャンセル申請が届いています。申請内容を確認してください。`,
    );
    return responseJson({ event: await hydratedEvent(env.DB, row, member.id, elevated, memberPublicId) }, 201);
  }
  if (cancellationReviewMatch && request.method === "PATCH") {
    const id = decodeURIComponent(cancellationReviewMatch[1]);
    const targetPublicId = decodeURIComponent(cancellationReviewMatch[2]);
    const row = await eventRow(env.DB, id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    if (!(elevated || row.organizer_member_id === member.id)) return responseJson({ error: "幹事または運営メンバーのみ操作できます" }, 403);
    const targetId = await memberIdFromPublicId(env.DB, targetPublicId);
    const input = await readBody(request);
    if (!targetId || (input?.action !== "approve" && input?.action !== "reject")) return responseJson({ error: "入力内容を確認してください" }, 400);
    const now = new Date().toISOString();
    const requestRow = await env.DB.prepare(`SELECT id, late_cancellation_at FROM event_cancellation_requests
      WHERE event_id = ? AND member_id = ? AND status = 'pending' ORDER BY requested_at DESC LIMIT 1`).bind(id, targetId).first<{ id: string; late_cancellation_at: string | null }>();
    if (!requestRow) return responseJson({ error: "キャンセル申請が見つかりません" }, 404);
    const approved = input.action === "approve";
    const statements = [
      env.DB.prepare(`UPDATE event_cancellation_requests SET status = ?, reviewed_at = ?, reviewed_by_member_id = ? WHERE id = ?`)
        .bind(approved ? "approved" : "rejected", now, member.id, requestRow.id),
      env.DB.prepare(`UPDATE event_participations SET status = ?, cancelled_at = ?, updated_at = ? WHERE event_id = ? AND member_id = ?`)
        .bind(approved ? "cancelled" : "confirmed", approved ? now : null, now, id, targetId),
    ];
    if (approved) statements.push(
      env.DB.prepare("UPDATE events SET status = 'open', updated_at = ? WHERE id = ? AND status = 'full' AND COALESCE(json_extract(public_data_json, '$.participantsFinalizedAt'), '') = ''").bind(now, id),
    );
    await env.DB.batch(statements);
    if (approved) await refundEventPointDiscount(env.DB, id, targetId, row.title, now);
    if (approved) await notifyOrganizerParticipantCancellation(env.DB, row, targetId, member.id, now);
    if (approved && requestRow?.late_cancellation_at) {
      await applyLateCancellationPenalty(env.DB, { eventId: id, memberId: targetId, assignedBy: member.id, assignedAt: now, title: row.title });
    }
    await audit(env.DB, member.id, approved ? "event.cancellation_approved" : "event.cancellation_rejected", id, { targetId });
    await notifyEventCancellation(
      env.DB,
      targetId,
      id,
      approved ? "キャンセル申請が承認されました" : "キャンセル申請が却下されました",
      approved
        ? `「${row.title}」のキャンセルが確定しました。必要に応じて幹事へご連絡ください。`
        : `「${row.title}」の参加は継続となりました。詳細は幹事へご確認ください。`,
    );
    const updated = await eventRow(env.DB, id);
    return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId) });
  }
  return responseJson({ error: "method_not_allowed" }, 405);
}
