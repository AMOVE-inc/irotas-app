import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const EVENTS_ENDPOINT = "/api/events";
const EVENT_PATH = /^\/api\/events\/([^/]+)$/;
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

function publicEvent(row: EventRow, viewerId: number, elevated: boolean) {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
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
    ...(viewerId === row.organizer_member_id || elevated ? { privateMemo: row.private_memo ?? undefined } : {}),
  };
}

const selectEvents = `SELECT e.*, m.public_member_id
  FROM events e JOIN members m ON m.id = e.organizer_member_id`;

async function createEvent(request: Request, db: D1Database, member: Awaited<ReturnType<typeof authenticatedRequestMember>>) {
  if (!member) return responseJson({ error: "ログインが必要です" }, 401);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_EVENT_BODY_BYTES)
    return responseJson({ error: "入力内容が大きすぎます" }, 413);
  const input = JSON.parse(raw) as Record<string, unknown>;
  const event = sanitizeEvent(input.event);
  if (!event) return responseJson({ error: "イベントの入力内容を確認してください" }, 400);
  const elevated = member.access_role === "operator" || member.access_role === "admin" || member.role === "operator" || member.role === "admin";
  if (event.eventType === "official" && !elevated)
    return responseJson({ error: "公式イベントは運営メンバーのみ作成できます" }, 403);
  if (event.eventType === "club" && !(elevated || member.access_role === "club_leader"))
    return responseJson({ error: "部活イベントは部長または運営メンバーのみ作成できます" }, 403);
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
  return responseJson({ event: publicEvent(row!, member.id, elevated) }, 201);
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
  const imageMatch = EVENT_IMAGE_PATH.exec(pathname);
  if (pathname !== EVENTS_ENDPOINT && !eventMatch && !imageMatch && pathname !== "/api/event-images") return null;
  if (!env.DB) return responseJson({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return responseJson({ error: "ログインが必要です" }, 401);
  const elevated = member.access_role === "operator" || member.access_role === "admin" || member.role === "operator" || member.role === "admin";

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
    return responseJson({ events: (rows.results ?? []).map((row) => publicEvent(row, member.id, elevated)) });
  }
  if (eventMatch && request.method === "GET") {
    const row = await env.DB.prepare(`${selectEvents} WHERE e.id = ? LIMIT 1`).bind(decodeURIComponent(eventMatch[1])).first<EventRow>();
    if (!row || row.status === "cancelled") return responseJson({ error: "イベントが見つかりません" }, 404);
    return responseJson({ event: publicEvent(row, member.id, elevated) });
  }
  return responseJson({ error: "method_not_allowed" }, 405);
}
