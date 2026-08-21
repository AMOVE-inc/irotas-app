import { authenticatedRequestMember } from "./auth";
import { canMemberAccessClub } from "./clubs";
import type { D1Database, SitesEnv } from "./platform-types";

const EVENTS_ENDPOINT = "/api/events";
const EVENT_PATH = /^\/api\/events\/([^/]+)$/;
const EVENT_FAVORITE_PATH = /^\/api\/events\/([^/]+)\/favorite$/;
const EVENT_APPLICATION_PATH = /^\/api\/events\/([^/]+)\/applications$/;
const EVENT_PARTICIPANT_PATH = /^\/api\/events\/([^/]+)\/participants\/([^/]+)$/;
const EVENT_CANCELLATION_PATH = /^\/api\/events\/([^/]+)\/cancellation-requests$/;
const EVENT_CANCELLATION_REVIEW_PATH = /^\/api\/events\/([^/]+)\/cancellation-requests\/([^/]+)$/;
const EVENT_IMAGE_PATH = /^\/api\/event-images\/([^/]+)$/;
const MAX_EVENT_BODY_BYTES = 96 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type EventRow = {
  id: string;
  organizer_member_id: number;
  public_member_id: string | null;
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
  const image = text(input.image, 500, true);
  if (!image || !image.startsWith("/api/event-images/")) return null;
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
    image,
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
  const active = participations.filter((item) => item.status === "applied" || item.status === "confirmed" || item.status === "cancel_requested");
  const confirmed = active.filter((item) => item.status === "confirmed" || item.status === "cancel_requested");
  const viewerParticipation = active.find((item) => item.member_id === viewerId)?.status ?? null;
  return {
    ...data,
    id: row.id,
    createdAt: row.created_at,
    eventType: row.event_type,
    clubId: row.club_id ?? undefined,
    date: row.event_date,
    status: row.status === "cancelled" ? "ended" : row.status,
    title: row.title,
    createdBy: row.public_member_id ?? `member-${row.organizer_member_id}`,
    applicantIds: active.map(publicId),
    participants: confirmed.map(publicId),
    attendees: active.length,
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

const selectEvents = `SELECT e.*, m.public_member_id
  FROM events e JOIN members m ON m.id = e.organizer_member_id`;

function isElevated(member: NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>) {
  return member.access_role === "operator" || member.access_role === "admin" || member.role === "operator" || member.role === "admin";
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

async function createEvent(request: Request, db: D1Database, member: Awaited<ReturnType<typeof authenticatedRequestMember>>) {
  if (!member) return responseJson({ error: "ログインが必要です" }, 401);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_EVENT_BODY_BYTES)
    return responseJson({ error: "入力内容が大きすぎます" }, 413);
  const input = JSON.parse(raw) as Record<string, unknown>;
  const event = sanitizeEvent(input.event);
  if (!event) return responseJson({ error: "イベントの入力内容を確認してください" }, 400);
  const elevated = isElevated(member);
  if (event.eventType === "official" && !elevated)
    return responseJson({ error: "公式イベントは運営メンバーのみ作成できます" }, 403);
  if (event.eventType === "club" && !await canMemberAccessClub(db, event.clubId!, member.id, elevated))
    return responseJson({ error: "部活イベントは所属部員・部長・運営メンバーのみ作成できます" }, 403);
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
  const pathname = new URL(request.url).pathname;
  const eventMatch = EVENT_PATH.exec(pathname);
  const favoriteMatch = EVENT_FAVORITE_PATH.exec(pathname);
  const applicationMatch = EVENT_APPLICATION_PATH.exec(pathname);
  const participantMatch = EVENT_PARTICIPANT_PATH.exec(pathname);
  const cancellationMatch = EVENT_CANCELLATION_PATH.exec(pathname);
  const cancellationReviewMatch = EVENT_CANCELLATION_REVIEW_PATH.exec(pathname);
  const imageMatch = EVENT_IMAGE_PATH.exec(pathname);
  if (pathname !== EVENTS_ENDPOINT && !eventMatch && !favoriteMatch && !applicationMatch && !participantMatch && !cancellationMatch && !cancellationReviewMatch && !imageMatch && pathname !== "/api/event-images") return null;
  if (!env.DB) return responseJson({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return responseJson({ error: "ログインが必要です" }, 401);
  const elevated = isElevated(member);
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
    const rows = await env.DB.prepare(`${selectEvents} WHERE e.status != 'cancelled' ORDER BY e.event_date, e.created_at DESC`).all<EventRow>();
    const events = await Promise.all((rows.results ?? []).map(async (row) => {
      if (row.event_type === "club" && row.club_id && !await canMemberAccessClub(env.DB!, row.club_id, member.id, elevated))
        return lockedClubEventPreview(row);
      return hydratedEvent(env.DB!, row, member.id, elevated, memberPublicId);
    }));
    return responseJson({ events });
  }
  if (eventMatch && request.method === "GET") {
    const row = await eventRow(env.DB, decodeURIComponent(eventMatch[1]));
    if (!row || row.status === "cancelled") return responseJson({ error: "イベントが見つかりません" }, 404);
    if (row.event_type === "club" && row.club_id && !await canMemberAccessClub(env.DB, row.club_id, member.id, elevated))
      return responseJson({ error: "この部活の部員のみ詳細を閲覧できます" }, 403);
    return responseJson({ event: await hydratedEvent(env.DB, row, member.id, elevated, memberPublicId) });
  }
  if (favoriteMatch && request.method === "PUT") {
    const id = decodeURIComponent(favoriteMatch[1]);
    const row = await eventRow(env.DB, id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    if (row.event_type === "club" && row.club_id && !await canMemberAccessClub(env.DB, row.club_id, member.id, elevated))
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
    if (!row || row.status !== "open") return responseJson({ error: "現在、このイベントには申し込めません" }, 409);
    if (row.event_type === "club" && row.club_id && !await canMemberAccessClub(env.DB, row.club_id, member.id, elevated))
      return responseJson({ error: "この部活の部員のみ参加申込できます" }, 403);
    if (row.organizer_member_id === member.id) return responseJson({ error: "幹事は参加申込できません" }, 409);
    const input = await readBody(request);
    if (input?.termsAccepted !== true) return responseJson({ error: "イベント参加規約への同意が必要です" }, 400);
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
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
    await env.DB.prepare(`INSERT INTO event_participations
      (event_id, member_id, status, terms_accepted_at, applied_at, confirmed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id, member_id) DO UPDATE SET status = excluded.status,
        terms_accepted_at = excluded.terms_accepted_at, applied_at = excluded.applied_at,
        confirmed_at = excluded.confirmed_at, cancelled_at = NULL, updated_at = excluded.updated_at`)
      .bind(id, member.id, status, now, now, immediate ? now : null, now).run();
    if (immediate && (count?.count ?? 0) + 1 >= capacity)
      await env.DB.prepare("UPDATE events SET status = 'full', updated_at = ? WHERE id = ?").bind(now, id).run();
    await audit(env.DB, member.id, "event.application_submitted", id, { status });
    const updated = await eventRow(env.DB, id);
    return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId) }, 201);
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
      await env.DB.prepare("UPDATE events SET public_data_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(data), now, id).run();
      await notifyEventConfirmation(env.DB, targetId, id, row.title);
      if ((count?.count ?? 0) + 1 >= capacity) await env.DB.prepare("UPDATE events SET status = 'full', updated_at = ? WHERE id = ?").bind(now, id).run();
    } else {
      await env.DB.prepare(`UPDATE event_participations SET status = 'cancelled', cancelled_at = ?, updated_at = ?
        WHERE event_id = ? AND member_id = ?`).bind(now, now, id, targetId).run();
      await env.DB.prepare("UPDATE events SET status = 'open', updated_at = ? WHERE id = ? AND status = 'full'").bind(now, id).run();
    }
    await audit(env.DB, member.id, input.action === "approve" ? "event.participant_confirmed" : "event.participant_cancelled", id, { targetId });
    const updated = await eventRow(env.DB, id);
    return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId) });
  }
  if (cancellationMatch && request.method === "POST") {
    const id = decodeURIComponent(cancellationMatch[1]);
    const row = await eventRow(env.DB, id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    const input = await readBody(request);
    if (input?.contactedOrganizer !== true || input?.policyConfirmed !== true)
      return responseJson({ error: "幹事への連絡とキャンセルポリシーの確認が必要です" }, 400);
    const participation = await env.DB.prepare("SELECT status FROM event_participations WHERE event_id = ? AND member_id = ?").bind(id, member.id).first<{ status: string }>();
    if (participation?.status !== "confirmed") return responseJson({ error: "参加確定者のみキャンセル申請できます" }, 409);
    const pending = await env.DB.prepare("SELECT id FROM event_cancellation_requests WHERE event_id = ? AND member_id = ? AND status = 'pending'").bind(id, member.id).first<{ id: string }>();
    if (pending) return responseJson({ error: "すでにキャンセル申請中です" }, 409);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO event_cancellation_requests
        (id, event_id, member_id, contacted_organizer, policy_confirmed, status, requested_at)
        VALUES (?, ?, ?, 1, 1, 'pending', ?)`).bind(`cancel_${crypto.randomUUID()}`, id, member.id, now),
      env.DB.prepare("UPDATE event_participations SET status = 'cancel_requested', updated_at = ? WHERE event_id = ? AND member_id = ?").bind(now, id, member.id),
    ]);
    await audit(env.DB, member.id, "event.cancellation_requested", id);
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
    const requestRow = await env.DB.prepare(`SELECT id FROM event_cancellation_requests
      WHERE event_id = ? AND member_id = ? AND status = 'pending' ORDER BY requested_at DESC LIMIT 1`).bind(id, targetId).first<{ id: string }>();
    if (!requestRow) return responseJson({ error: "キャンセル申請が見つかりません" }, 404);
    const approved = input.action === "approve";
    const statements = [
      env.DB.prepare(`UPDATE event_cancellation_requests SET status = ?, reviewed_at = ?, reviewed_by_member_id = ? WHERE id = ?`)
        .bind(approved ? "approved" : "rejected", now, member.id, requestRow.id),
      env.DB.prepare(`UPDATE event_participations SET status = ?, cancelled_at = ?, updated_at = ? WHERE event_id = ? AND member_id = ?`)
        .bind(approved ? "cancelled" : "confirmed", approved ? now : null, now, id, targetId),
    ];
    if (approved) statements.push(
      env.DB.prepare("UPDATE events SET status = 'open', updated_at = ? WHERE id = ? AND status = 'full'").bind(now, id),
    );
    await env.DB.batch(statements);
    await audit(env.DB, member.id, approved ? "event.cancellation_approved" : "event.cancellation_rejected", id, { targetId });
    const updated = await eventRow(env.DB, id);
    return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId) });
  }
  return responseJson({ error: "method_not_allowed" }, 405);
}
