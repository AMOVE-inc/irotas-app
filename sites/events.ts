import { authenticatedRequestMember, effectiveMemberRank } from "./auth";
import { canMemberAccessClub } from "./clubs";
import { reverseCancelledEventHostXp } from "./event-host-xp";
import { applyEventPointDiscount, refundEventPointDiscount } from "./event-points";
import { cancelEventCheckout, eventCheckoutAmount } from "./event-checkout";
import { EVENT_XP, awardEventReward, reverseEventRewards } from "./event-rewards";
import type { D1Database, SitesEnv } from "./platform-types";
import { displayEventTitle } from "../lib/event-title";
import { IMPORTED_DISCORD_EVENTS } from "../constants/imported-discord-events";
import { mentionsViewer } from "../lib/mention-matching";

const EVENTS_ENDPOINT = "/api/events";
const EVENT_PATH = /^\/api\/events\/([^/]+)$/;
const EVENT_COMMENTS_PATH = /^\/api\/events\/([^/]+)\/comments$/;
const EVENT_COMMENT_PATH = /^\/api\/events\/([^/]+)\/comments\/([^/]+)$/;
const EVENT_COMMENT_REACTION_PATH = /^\/api\/events\/([^/]+)\/comments\/([^/]+)\/reactions$/;
const EVENT_FAVORITE_PATH = /^\/api\/events\/([^/]+)\/favorite$/;
const EVENT_APPLICATION_PATH = /^\/api\/events\/([^/]+)\/applications$/;
const EVENT_FINALIZE_PATH = /^\/api\/events\/([^/]+)\/finalize$/;
const EVENT_PARTICIPANT_PATH = /^\/api\/events\/([^/]+)\/participants\/([^/]+)$/;
const EVENT_CANCELLATION_PATH = /^\/api\/events\/([^/]+)\/cancellation-requests$/;
const EVENT_CANCELLATION_REVIEW_PATH = /^\/api\/events\/([^/]+)\/cancellation-requests\/([^/]+)$/;
const EVENT_ATTENDANCE_PATH = /^\/api\/events\/([^/]+)\/attendance$/;
const EVENT_CANCELLATION_PREVIEW_PATH = /^\/api\/events\/([^/]+)\/cancellation-penalty-preview$/;
const EVENT_IMAGE_PATH = /^\/api\/event-images\/([^/]+)$/;
const MAX_EVENT_BODY_BYTES = 96 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const DELETED_EVENT_IDS = new Set(["discord-event-1504772980851478548"]);
const BOARD_EVENTS_TO_REGISTER = [
  "discord-event-1545026554533249044", // LA'S TOKYO
  "discord-event-1543599911507861514", // さわいしmini
  "discord-event-1543113999640694826", // VINOMONDO
];

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
  payment_state?: "awaiting_selection" | "awaiting_payment" | null;
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

function isImportedEventConfirmedParticipant(row: EventRow, memberPublicId: string, participations: ParticipationRow[] = []): boolean {
  if (!row.id.startsWith("discord-event-")) return false;
  try {
    const data = JSON.parse(row.public_data_json) as { manualParticipantIds?: unknown };
    if (Array.isArray(data.manualParticipantIds) && data.manualParticipantIds.includes(memberPublicId)) return true;
  } catch {}
  return participations.some((participation) => participation.public_member_id === memberPublicId &&
    (participation.status === "confirmed" || participation.status === "cancel_requested"));
}

type StoredEventComment = {
  id: string;
  event_id: string;
  author_member_id: number | null;
  author_name: string;
  author_public_id: string | null;
  content: string;
  created_at: string;
  deleted_at: string | null;
};

type ImportedEventComment = { id: string; author: string; authorId?: string; text: string; createdAt: string };

function importedEventComments(row: EventRow): ImportedEventComment[] {
  try {
    const data = JSON.parse(row.public_data_json) as { importedComments?: unknown };
    return Array.isArray(data.importedComments)
      ? data.importedComments.filter((comment): comment is ImportedEventComment =>
        Boolean(comment && typeof comment === "object" && typeof comment.id === "string" && typeof comment.author === "string" && typeof comment.text === "string" && typeof comment.createdAt === "string"))
      : [];
  } catch { return []; }
}

export function mergeEventComments(
  imported: ImportedEventComment[], stored: StoredEventComment[],
  viewer: { memberId: number; publicId: string; discordUserId: string | null; elevated: boolean },
  reactions: Record<string, Record<string, string[]>> = {},
) {
  const overrides = new Map(stored.map((comment) => [comment.id, comment]));
  const importedIds = new Set(imported.map((comment) => comment.id));
  const canonicalImportedId = (id: string) => id.replace(/^discord-event-comment-(?:discord-comment-)?(?=\d{17,20}$)/, "discord-event-comment-");
  const importedGroups = new Map<string, ImportedEventComment[]>();
  const sameImportedContent = new Map<string, string>();
  for (const comment of imported) {
    const contentKey = `${comment.authorId ?? comment.author}:${comment.text}:${Date.parse(comment.createdAt)}`;
    const key = sameImportedContent.get(contentKey) ?? canonicalImportedId(comment.id);
    sameImportedContent.set(contentKey, key);
    importedGroups.set(key, [...(importedGroups.get(key) ?? []), comment]);
  }
  return [
    ...[...importedGroups.values()].filter((group) => !group.some((comment) => overrides.get(comment.id)?.deleted_at)).map((group) => {
      const comment = group[0];
      const override = group.map((item) => overrides.get(item.id)).find((item) => item && !item.deleted_at);
      return {
        id: comment.id, author: override?.author_name ?? comment.author,
        authorId: override?.author_public_id ?? comment.authorId,
        text: override?.content ?? comment.text, createdAt: comment.createdAt,
        reactions: reactions[comment.id] ?? {},
        canEdit: viewer.elevated || Boolean(comment.authorId && (
          comment.authorId === viewer.publicId || (viewer.discordUserId && comment.authorId === `discord-${viewer.discordUserId}`)
        )),
      };
    }),
    ...stored.filter((comment) => !importedIds.has(comment.id) && !comment.deleted_at).map((comment) => ({
      id: comment.id, author: comment.author_name, authorId: comment.author_public_id ?? undefined,
      text: comment.content, createdAt: comment.created_at,
      reactions: reactions[comment.id] ?? {},
      canEdit: viewer.elevated || comment.author_member_id === viewer.memberId,
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

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

type EventMentionMember = { id: number; display_name: string; public_member_id: string | null };

function eventMentionDisplayName(value: string) {
  return value
    .replace(/\s*[【[(（]\s*(?:🥈|🥇|💎)?\s*(?:REGULAR|SILVER|GOLD|PLATINUM|レギュラー|シルバー|ゴールド|プラチナ)(?:会員)?\s*[】\])）]/giu, "")
    .replace(/\s*[【[(（]\s*(?:運営(?:メンバー)?|管理者|admin)\s*[】\])）]/giu, "")
    .replace(/(?:🎞️?\s*)?映画[・･]?ドラマ鑑賞部長$/u, "")
    .replace(/(?:[🍖⛳🏃🚶⚾💃🎭🏀🍷✈️🍳🍞🐭🍺]\s*)?[^\s【】]{1,20}部長$/u, "")
    .trim();
}

/** Resolve individual event mentions safely. Ambiguous display names are ignored. */
export function eventMentionRecipientIds(
  content: string,
  previousContent: string,
  members: EventMentionMember[],
  actorMemberId: number,
) {
  const aliases = new Map<string, Set<number>>();
  const identityMentions = (value: string) => new Set(members.filter((member) => {
    if (member.id === actorMemberId || !member.public_member_id) return false;
    const escaped = member.public_member_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`@[^\\r\\n@]{1,80}（${escaped}）(?=$|[\\s、。！？!?.,，．:：;；)）\\]｝}])`, "u").test(value);
  }).map((member) => member.id));
  for (const member of members) {
    if (member.id === actorMemberId) continue;
    const labels = new Set([member.public_member_id ?? "", member.display_name, eventMentionDisplayName(member.display_name)]
      .map((label) => label.normalize("NFKC").trim()).filter(Boolean));
    for (const label of labels) aliases.set(label, new Set([...(aliases.get(label) ?? []), member.id]));
  }
  const resolve = (value: string) => {
    const ids = new Set<number>();
    for (const [label, candidates] of aliases) {
      if (candidates.size === 1 && mentionsViewer(value, [label])) ids.add([...candidates][0]);
    }
    return ids;
  };
  const current = resolve(content);
  const previous = resolve(previousContent);
  for (const id of identityMentions(content)) current.add(id);
  for (const id of identityMentions(previousContent)) previous.add(id);
  return [...current].filter((id) => !previous.has(id));
}

async function eventMentionNotificationStatements(
  db: D1Database,
  input: {
    eventId: string;
    eventTitle: string;
    content: string;
    previousContent?: string;
    actorMemberId: number;
    now: string;
    notificationScope?: string;
    locationLabel?: string;
  },
) {
  if (!input.content.includes("@")) return [];
  const result = await db.prepare(`SELECT id, display_name, public_member_id FROM members
    WHERE account_status = 'active' AND id != ?`).bind(input.actorMemberId).all<EventMentionMember>();
  const recipientIds = eventMentionRecipientIds(input.content, input.previousContent ?? "", result.results ?? [], input.actorMemberId);
  if (!recipientIds.length) return [];
  const actorName = await eventChatMemberName(db, input.actorMemberId);
  return recipientIds.map((targetMemberId) => db.prepare(`INSERT OR IGNORE INTO in_app_notifications
    (id, target_member_id, type, title, body, event_id, target_path, created_at)
    VALUES (?, ?, 'event_mention', ?, ?, ?, ?, ?)`)
    .bind(
      `event-mention:${input.eventId}:${input.notificationScope ?? crypto.randomUUID()}:${targetMemberId}`,
      targetMemberId,
      "イベントでメンションされました",
      `${actorName}さんが「${input.eventTitle}」の${input.locationLabel ?? "自由記述欄"}であなたをメンションしました。`,
      input.eventId,
      `/event-detail?id=${encodeURIComponent(input.eventId)}`,
      input.now,
    ));
}

function eventMentionContent(data: Record<string, unknown>) {
  return typeof data.publicNotes === "string" ? data.publicNotes : typeof data.description === "string" ? data.description : "";
}

function eventMentionsArePublished(eventType: EventRow["event_type"], data: Record<string, unknown>) {
  return eventType !== "official" || data.recruitmentStatus !== "draft";
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

const EVENT_RANK_KEYS = ["regular", "silver", "gold", "platinum"] as const;

function rankPrices(value: unknown): Record<(typeof EVENT_RANK_KEYS)[number], string> | Record<string, never> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const populated = EVENT_RANK_KEYS.filter((rank) => input[rank] !== undefined && input[rank] !== "");
  if (populated.length === 0) return {};
  if (populated.length !== EVENT_RANK_KEYS.length || Object.keys(input).some((key) => !EVENT_RANK_KEYS.includes(key as (typeof EVENT_RANK_KEYS)[number]))) return null;
  const result = {} as Record<(typeof EVENT_RANK_KEYS)[number], string>;
  for (const rank of EVENT_RANK_KEYS) {
    const normalized = String(input[rank]).normalize("NFKC").trim().replace(/,/g, "");
    const match = normalized.match(/^¥?(\d+)円?$/);
    const amount = match ? Number(match[1]) : 0;
    if (!Number.isInteger(amount) || amount < 500 || amount > 300_000 || amount % 500 !== 0) return null;
    result[rank] = `${amount.toLocaleString("ja-JP")}円`;
  }
  return result;
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
  const capacityMode = input.capacityMode === "undecided" || input.capacityMode === "unlimited" ? input.capacityMode : undefined;
  const capacity = number(input.capacity, capacityMode ? 0 : 1, 100);
  const reservationCapacity = number(input.reservationCapacity, 0, 101);
  const genres = stringArray(input.genres, 20);
  if (!eventType || !title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time || !/^([01]\d|2[0-3]):(00|15|30|45)$/.test(time) || capacity === null || (capacityMode && capacity !== 0) || reservationCapacity === null || genres === null)
    return null;
  const clubId = text(input.clubId, 80);
  if (eventType === "club" && !clubId) return null;
  const image = text(input.image, 500);
  if (image && !image.startsWith("/api/event-images/")) return null;
  const applicationDeadline = text(input.applicationDeadline, 10, true);
  if (!applicationDeadline || !/^\d{4}-\d{2}-\d{2}$/.test(applicationDeadline) || applicationDeadline > date) return null;
  const priceMin = number(input.priceMin, 0, 300_000);
  const priceMax = number(input.priceMax, 0, 300_000);
  const normalizedRankPrices = input.rankPrices === undefined ? {} : rankPrices(input.rankPrices);
  if (priceMin === null || priceMax === null || priceMin > priceMax || normalizedRankPrices === null || (eventType !== "official" && Object.keys(normalizedRankPrices).length > 0)) return null;

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
    capacityMode,
    reservationCapacity,
    attendees: 0,
    applicantIds: [] as string[],
    participants: [] as string[],
    companionIds: stringArray(input.companionIds, 100, 40) ?? [],
    price: text(input.price, 80) || "",
    priceMin,
    priceMax,
    genres,
    rankPrices: normalizedRankPrices,
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
  const usesImportedOrganizerFallback = data.materializedOrganizerFallback === true;
  const importedOrganizerId = usesImportedOrganizerFallback && typeof data.organizerProfileId === "string" ? data.organizerProfileId : null;
  const importedCreatedBy = usesImportedOrganizerFallback && typeof data.createdBy === "string" ? data.createdBy : null;
  const importedOrganizerName = usesImportedOrganizerFallback && typeof data.organizerName === "string" ? data.organizerName : null;
  const importedOrganizerAvatar = usesImportedOrganizerFallback && typeof data.organizerAvatar === "string" ? data.organizerAvatar : null;
  const importedOrganizerRank = usesImportedOrganizerFallback && typeof data.organizerRank === "string" ? data.organizerRank : null;
  const importedOrganizerAccessRole = usesImportedOrganizerFallback && ["admin", "operator", "member"].includes(String(data.organizerAccessRole))
    ? data.organizerAccessRole as "admin" | "operator" | "member"
    : undefined;
  const participantsFinalized = typeof data.participantsFinalizedAt === "string" && data.participantsFinalizedAt.length > 0;
  const active = participations.filter((item) => item.status === "applied" || item.status === "confirmed" || item.status === "cancel_requested");
  const confirmed = active.filter((item) => item.status === "confirmed" || item.status === "cancel_requested");
  const manualParticipantIds = Array.isArray(data.manualParticipantIds)
    ? data.manualParticipantIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : [];
  const participantIds = [...new Set([...confirmed.map(publicId), ...manualParticipantIds])];
  const cancelledParticipantIds = [...new Set([
    ...cancellations.filter((item) => item.status === "approved").map(publicId),
    ...(row.status === "cancelled" ? participantIds : []),
  ])];
  const viewerParticipation = active.find((item) => item.member_id === viewerId)?.status ?? null;
  const viewerPaymentState = active.find((item) => item.member_id === viewerId)?.payment_state ?? null;
  return {
    ...data,
    chatId: row.id.startsWith("discord-event-") || data.recruitmentChannel === "discord" ? undefined : data.chatId,
    id: row.id,
    recruitmentChannel: data.recruitmentChannel === "app" || data.recruitmentChannel === "discord"
      ? data.recruitmentChannel : row.id.startsWith("discord-event-") ? "discord" : "app",
    createdAt: row.created_at,
    eventType: row.event_type,
    clubId: row.club_id ?? undefined,
    date: row.event_date,
    // 定員に達していても、幹事が参加者を確定するまでは受付を継続する。
    status: row.status === "cancelled" ? "ended" : row.status === "full" && !participantsFinalized && !data.discordRecruitmentClosedAt && data.recruitmentChannel !== "discord" && !row.id.startsWith("discord-event-") ? "open" : row.status,
    isCancelled: row.status === "cancelled",
    title: displayEventTitle(row.title),
    createdBy: importedCreatedBy ?? importedOrganizerId ?? row.public_member_id ?? `member-${row.organizer_member_id}`,
    organizerProfileId: importedOrganizerId ?? row.public_member_id ?? `member-${row.organizer_member_id}`,
    organizerName: importedOrganizerName ?? (row.organizer_display_name?.trim() || "メンバー"),
    organizerAvatar: importedOrganizerAvatar ?? organizerProfile(row),
    organizerRank: importedOrganizerRank ?? row.organizer_member_rank ?? undefined,
    organizerAccessRole: usesImportedOrganizerFallback ? importedOrganizerAccessRole : row.organizer_access_role ?? undefined,
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
    viewerPaymentState,
    isFavorite: favorite,
    isOrganizer: !usesImportedOrganizerFallback && viewerId === row.organizer_member_id,
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
    title: displayEventTitle(row.title),
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
    db.prepare(`SELECT p.event_id, p.member_id, m.public_member_id, p.status, p.payment_state
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

async function isDeletedImportedEvent(db: D1Database, eventId: string) {
  if (!eventId.startsWith("discord-event-")) return false;
  const row = await db.prepare("SELECT 1 AS deleted FROM deleted_imported_events WHERE event_id = ? LIMIT 1")
    .bind(eventId).first<{ deleted: number }>();
  return Boolean(row);
}

/**
 * Discordアーカイブの更新直後でも詳細表示・編集を止めないため、参照された
 * 移行イベントをD1へ遅延反映する。通常は幹事を実会員へ照合し、照合前の
 * イベントを運営が編集する場合だけ内部所有者を一時的に運営へ割り当てる。
 */
async function materializeImportedEvent(db: D1Database, eventId: string, fallbackOrganizerMemberId?: number) {
  if (await isDeletedImportedEvent(db, eventId)) return null;
  const imported = IMPORTED_DISCORD_EVENTS.find((event) => event.id === eventId);
  const discordUserId = imported?.organizerProfileId?.replace(/^discord-/, "");
  if (!imported || !discordUserId || !/^\d{17,20}$/.test(discordUserId)) return null;
  const organizer = await db.prepare("SELECT id FROM members WHERE discord_user_id = ? LIMIT 1")
    .bind(discordUserId).first<{ id: number }>();
  const organizerMemberId = organizer?.id ?? fallbackOrganizerMemberId;
  if (!organizerMemberId) return null;
  const now = new Date().toISOString();
  const publicData = organizer ? imported : { ...imported, materializedOrganizerFallback: true };
  await db.prepare(`INSERT OR IGNORE INTO events
    (id, organizer_member_id, event_type, club_id, event_date, status, title, public_data_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(imported.id, organizerMemberId, imported.eventType, imported.clubId ?? null, imported.date, imported.status, displayEventTitle(imported.title), JSON.stringify(publicData), imported.createdAt ?? now, now).run();
  return eventRow(db, eventId);
}

async function memberIdFromPublicId(db: D1Database, value: string) {
  const direct = /^member-(\d+)$/.exec(value);
  if (direct) return Number(direct[1]);
  const row = await db.prepare("SELECT id FROM members WHERE public_member_id = ? LIMIT 1").bind(value).first<{ id: number }>();
  return row?.id ?? null;
}

async function reconcileImportedOrganizer(db: D1Database, memberId: number) {
  const identity = await db.prepare("SELECT discord_user_id FROM members WHERE id = ? LIMIT 1")
    .bind(memberId).first<{ discord_user_id: string | null }>();
  const discordUserId = identity?.discord_user_id;
  if (!discordUserId || !/^\d{17,20}$/.test(discordUserId)) return null;
  // A migrated event may have been temporarily assigned to staff before its
  // Discord organizer linked an account. Restore ownership only on exact ID match.
  await db.prepare(`UPDATE events SET organizer_member_id = ?,
      public_data_json = json_remove(public_data_json, '$.materializedOrganizerFallback'), updated_at = ?
    WHERE id LIKE 'discord-event-%'
      AND json_extract(public_data_json, '$.materializedOrganizerFallback') = 1
      AND json_extract(public_data_json, '$.organizerProfileId') = ?`)
    .bind(memberId, new Date().toISOString(), `discord-${discordUserId}`).run();
  return `discord-${discordUserId}`;
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

/** Squareの支払済注文に対応する応募だけを確定し、再送時は通知・チャットを重複させない。 */
export async function confirmPaidEventParticipation(db: D1Database, eventId: string, memberId: number, now: string) {
  const row = await eventRow(db, eventId);
  if (!row || row.status === "cancelled" || row.status === "ended") return false;
  const changed = await db.prepare(`UPDATE event_participations
    SET status = 'confirmed', payment_state = 'completed', confirmed_at = ?, cancelled_at = NULL, updated_at = ?
    WHERE event_id = ? AND member_id = ? AND status = 'applied' AND payment_state = 'awaiting_payment'
      AND EXISTS (SELECT 1 FROM event_payment_checkouts
        WHERE event_id = ? AND member_id = ? AND status = 'paid')`)
    .bind(now, now, eventId, memberId, eventId, memberId).run();
  const transitioned = Number(changed.meta?.changes ?? 0) > 0;
  if (!transitioned) {
    const participation = await db.prepare("SELECT status, payment_state FROM event_participations WHERE event_id = ? AND member_id = ?")
      .bind(eventId, memberId).first<{ status: string; payment_state: string | null }>();
    if (participation?.status !== "confirmed" || participation.payment_state !== "completed") return false;
  }
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
  const chatId = typeof data.chatId === "string" && data.chatId ? data.chatId : eventChatId(eventId);
  const targetName = await eventChatMemberName(db, memberId);
  await db.batch([
    db.prepare(`UPDATE events SET public_data_json = json_set(public_data_json, '$.chatId', ?), updated_at = ?
      WHERE id = ? AND COALESCE(json_extract(public_data_json, '$.chatId'), '') = ''`).bind(chatId, now, eventId),
    db.prepare(`INSERT OR IGNORE INTO chat_rooms (id, name, room_type, source_id, created_by_member_id, created_at, updated_at)
      VALUES (?, ?, 'event', ?, ?, ?, ?)`).bind(chatId, row.title, eventId, row.organizer_member_id, now, now),
    db.prepare(`INSERT INTO chat_room_members (room_id, member_id, member_role, joined_at, left_at)
      VALUES (?, ?, 'owner', ?, NULL) ON CONFLICT(room_id, member_id) DO UPDATE SET member_role = 'owner', left_at = NULL`)
      .bind(chatId, row.organizer_member_id, now),
    db.prepare(`INSERT INTO chat_room_members (room_id, member_id, member_role, joined_at, left_at)
      VALUES (?, ?, 'member', ?, NULL) ON CONFLICT(room_id, member_id) DO UPDATE SET left_at = NULL`)
      .bind(chatId, memberId, now),
    db.prepare(`INSERT OR IGNORE INTO chat_messages (id, room_id, sender_member_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(`event-chat-welcome:${eventId}`, chatId, row.organizer_member_id, eventChatSystemContent(`「${row.title}」の参加者専用グループが作成されました`), now, now),
    db.prepare(`INSERT OR IGNORE INTO chat_messages (id, room_id, sender_member_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(`event-chat-join:${eventId}:${memberId}`, chatId, row.organizer_member_id, eventChatSystemContent(`${targetName}がチャットに参加しました`), now, now),
    db.prepare(`INSERT OR IGNORE INTO in_app_notifications
      (id, target_member_id, type, title, body, event_id, created_at)
      VALUES (?, ?, 'event_confirmed', ?, ?, ?, ?)`).bind(
        `event-payment-confirmed:${eventId}:${memberId}`, memberId, "イベント参加が確定しました",
        `「${row.title}」の決済が完了し、参加者専用チャットへ追加されました。`, eventId, now,
      ),
  ]);
  if (transitioned) await audit(db, memberId, "event.payment_confirmed", eventId, { memberId });
  return true;
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
  if (row.id.startsWith("discord-event-") || data.recruitmentChannel === "discord") return;
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
  await notifyEventCancellation(db, targetMemberId, row.id, "イベントのキャンセルが確定しました", body);
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
  if (row.id.startsWith("discord-event-") || data.recruitmentChannel === "discord") return;
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
  const mentionNotifications = eventMentionsArePublished(event.eventType, event)
    ? await eventMentionNotificationStatements(db, {
      eventId: id,
      eventTitle: event.title,
      content: event.publicNotes ?? event.description,
      actorMemberId: member.id,
      now,
    })
    : [];
  await db.batch([
    db.prepare(`INSERT INTO events
      (id, organizer_member_id, event_type, club_id, event_date, status, title, public_data_json, private_memo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`)
      .bind(id, member.id, event.eventType, event.clubId ?? null, event.date, event.title, JSON.stringify(event), privateMemo, now, now),
    db.prepare(`INSERT INTO audit_logs
      (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (?, 'event.created', 'event', ?, ?, ?)`)
      .bind(String(member.id), id, JSON.stringify({ eventType: event.eventType }), now),
    ...mentionNotifications,
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
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0];
  const isVideo = /^video\/(mp4|quicktime|webm)$/i.test(contentType);
  if (!isVideo && !/^image\/(jpeg|png|webp|gif)$/i.test(contentType))
    return responseJson({ error: "JPEG・PNG・WebP・GIF画像、MP4・MOV・WebM動画を選択してください" }, 415);
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (declared > maxBytes) return responseJson({ error: isVideo ? "動画は30MB以内にしてください" : "画像は8MB以内にしてください" }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > maxBytes)
    return responseJson({ error: isVideo ? "動画は30MB以内にしてください" : "画像は8MB以内にしてください" }, 413);
  const extension = contentType === "video/quicktime" ? "mov" : contentType.split("/")[1].replace("jpeg", "jpg");
  const key = `events/${memberId}/${crypto.randomUUID()}.${extension}`;
  await env.UPLOADS.put(key, bytes, { httpMetadata: { contentType } });
  return responseJson({ imageUrl: `/api/event-images/${encodeURIComponent(key)}` }, 201);
}

export async function handleEventRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const eventMatch = EVENT_PATH.exec(pathname);
  const commentsMatch = EVENT_COMMENTS_PATH.exec(pathname);
  const commentMatch = EVENT_COMMENT_PATH.exec(pathname);
  const commentReactionMatch = EVENT_COMMENT_REACTION_PATH.exec(pathname);
  const favoriteMatch = EVENT_FAVORITE_PATH.exec(pathname);
  const applicationMatch = EVENT_APPLICATION_PATH.exec(pathname);
  const finalizeMatch = EVENT_FINALIZE_PATH.exec(pathname);
  const participantMatch = EVENT_PARTICIPANT_PATH.exec(pathname);
  const cancellationMatch = EVENT_CANCELLATION_PATH.exec(pathname);
  const cancellationReviewMatch = EVENT_CANCELLATION_REVIEW_PATH.exec(pathname);
  const imageMatch = EVENT_IMAGE_PATH.exec(pathname);
  const attendanceMatch = EVENT_ATTENDANCE_PATH.exec(pathname);
  const cancellationPreviewMatch = EVENT_CANCELLATION_PREVIEW_PATH.exec(pathname);
  if (pathname !== EVENTS_ENDPOINT && !eventMatch && !commentsMatch && !commentMatch && !commentReactionMatch && !favoriteMatch && !applicationMatch && !finalizeMatch && !participantMatch && !cancellationMatch && !cancellationReviewMatch && !attendanceMatch && !cancellationPreviewMatch && !imageMatch && pathname !== "/api/event-images") return null;
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
    const wantsRange = /^bytes=(?:\d+-\d*|-\d+)$/.test(request.headers.get("range") ?? "");
    const object = await env.UPLOADS.get(key, wantsRange ? { range: request.headers } : undefined);
    if (!object) return responseJson({ error: "not found" }, 404);
    const headers = new Headers({ "content-type": object.httpMetadata?.contentType ?? "application/octet-stream", "cache-control": "private, max-age=86400", vary: "Cookie, Authorization", "accept-ranges": "bytes" });
    if (wantsRange && object.range && object.size) {
      headers.set("content-range", `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
      headers.set("content-length", String(object.range.length));
      return new Response(object.body, { status: 206, headers });
    }
    return new Response(object.body, { headers });
  }
  if (pathname === EVENTS_ENDPOINT && request.method === "POST")
    return createEvent(request, env.DB, member);
  if (pathname === EVENTS_ENDPOINT && request.method === "GET") {
    const viewerDiscordId = await reconcileImportedOrganizer(env.DB, member.id);
    // なんでも掲示板で募集された3件を、既存のDiscord移行イベントとして登録する。
    // 個別に削除済みのIDはmaterializeImportedEvent内で除外される。
    const fallbackOrganizer = await env.DB.prepare("SELECT id FROM members WHERE access_role = 'admin' AND account_status = 'active' ORDER BY id LIMIT 1")
      .first<{ id: number }>();
    for (const id of BOARD_EVENTS_TO_REGISTER) {
      if (!DELETED_EVENT_IDS.has(id)) await materializeImportedEvent(env.DB, id, fallbackOrganizer?.id);
    }
    const includeCancelled = url.searchParams.get("includeCancelled") === "1";
    const rows = await env.DB.prepare(`${selectEvents} ORDER BY e.event_date, e.created_at DESC`).all<EventRow>();
    const deleted = await env.DB.prepare("SELECT event_id FROM deleted_imported_events").all<{ event_id: string }>();
    const deletedIds = new Set((deleted.results ?? []).map((item) => item.event_id));
    const [participations, cancellations, favorites] = await Promise.all([
      env.DB.prepare(`SELECT p.event_id, p.member_id, m.public_member_id, p.status
        FROM event_participations p JOIN members m ON m.id = p.member_id`).all<ParticipationRow>(),
      env.DB.prepare(`SELECT c.event_id, c.member_id, m.public_member_id, c.requested_at,
        c.contacted_organizer, c.policy_confirmed, c.status
        FROM event_cancellation_requests c JOIN members m ON m.id = c.member_id`).all<CancellationRow>(),
      env.DB.prepare("SELECT event_id FROM event_favorites WHERE member_id = ?").bind(member.id).all<{ event_id: string }>(),
    ]);
    const byEvent = <T extends { event_id: string }>(items: T[]) => {
      const result = new Map<string, T[]>();
      for (const item of items) {
        const group = result.get(item.event_id) ?? [];
        group.push(item);
        result.set(item.event_id, group);
      }
      return result;
    };
    const participationsByEvent = byEvent(participations.results ?? []);
    const cancellationsByEvent = byEvent(cancellations.results ?? []);
    const favoriteIds = new Set((favorites.results ?? []).map((item) => item.event_id));
    const allPersistedRows = rows.results ?? [];
    const persistedRows = allPersistedRows.filter((row) =>
      (includeCancelled || row.status !== "cancelled") && !DELETED_EVENT_IDS.has(row.id) && !deletedIds.has(row.id));
    const persistedIds = new Set(allPersistedRows.map((row) => row.id));
    const persistedSourceThreadIds = new Set(allPersistedRows.map((row) => {
      try { return (JSON.parse(row.public_data_json) as { sourceThreadId?: string }).sourceThreadId; }
      catch { return undefined; }
    }).filter((id): id is string => Boolean(id)));
    const events = await Promise.all(persistedRows.map(async (row) => {
      if (row.event_type === "club" && row.club_id && row.organizer_member_id !== member.id && !isImportedEventConfirmedParticipant(row, memberPublicId, participationsByEvent.get(row.id)) && !await canMemberAccessClub(env.DB!, row.club_id, member.id, admin))
        return lockedClubEventPreview(row);
      return publicEvent(row, member.id, memberPublicId, elevated,
        participationsByEvent.get(row.id) ?? [], cancellationsByEvent.get(row.id) ?? [], favoriteIds.has(row.id));
    }));
    // Keep the app-edited D1 row authoritative. Historical Discord event seeds
    // missing from D1 are listable without writing over titles, photos or dates.
    const missingImportedEvents = IMPORTED_DISCORD_EVENTS.filter((event) =>
      (event.eventType !== "club" || event.organizerProfileId === viewerDiscordId) && !persistedIds.has(event.id) && !persistedSourceThreadIds.has(event.sourceThreadId) &&
      !DELETED_EVENT_IDS.has(event.id) && !deletedIds.has(event.id),
    ).map((event) => ({ ...event, recruitmentChannel: "discord" as const, isOrganizer: Boolean(viewerDiscordId && event.organizerProfileId === viewerDiscordId) }));
    return responseJson({ events: [...events, ...missingImportedEvents], deletedImportedEventIds: [...deletedIds] });
  }
  if (eventMatch && request.method === "GET") {
    await reconcileImportedOrganizer(env.DB, member.id);
    const requestedEventId = decodeURIComponent(eventMatch[1]);
    if (DELETED_EVENT_IDS.has(requestedEventId) || await isDeletedImportedEvent(env.DB, requestedEventId)) return responseJson({ error: "イベントが見つかりません" }, 404);
    const fallbackOrganizer = await env.DB.prepare("SELECT id FROM members WHERE access_role = 'admin' AND account_status = 'active' ORDER BY id LIMIT 1")
      .first<{ id: number }>();
    const row = await eventRow(env.DB, requestedEventId) ?? await materializeImportedEvent(env.DB, requestedEventId, fallbackOrganizer?.id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    if (row.event_type === "club" && row.club_id && !await canMemberAccessClub(env.DB, row.club_id, member.id, admin)) {
      const participation = row.id.startsWith("discord-event-")
        ? await env.DB.prepare("SELECT status FROM event_participations WHERE event_id = ? AND member_id = ? LIMIT 1")
          .bind(row.id, member.id).first<{ status: ParticipationRow["status"] }>() : null;
      const isConfirmed = isImportedEventConfirmedParticipant(row, memberPublicId) ||
        participation?.status === "confirmed" || participation?.status === "cancel_requested";
      if (!isConfirmed) return responseJson({ error: "この部活の部員のみ詳細を閲覧できます" }, 403);
    }
    return responseJson({ event: await hydratedEvent(env.DB, row, member.id, elevated, memberPublicId) });
  }
  if (commentsMatch || commentMatch || commentReactionMatch) {
    const id = decodeURIComponent((commentsMatch ?? commentMatch ?? commentReactionMatch)![1]);
    if (DELETED_EVENT_IDS.has(id) || await isDeletedImportedEvent(env.DB, id)) return responseJson({ error: "イベントが見つかりません" }, 404);
    const row = await eventRow(env.DB, id) ?? await materializeImportedEvent(env.DB, id);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    if (row.event_type === "club" && row.club_id && !await canMemberAccessClub(env.DB, row.club_id, member.id, admin))
      return responseJson({ error: "この部活の部員のみコメントを閲覧できます" }, 403);
    const identity = await env.DB.prepare("SELECT display_name, discord_user_id FROM members WHERE id = ?")
      .bind(member.id).first<{ display_name: string; discord_user_id: string | null }>();
    const imported = importedEventComments(row);
    const ownsImported = (comment: ImportedEventComment) => Boolean(comment.authorId && (
      comment.authorId === memberPublicId || (identity?.discord_user_id && comment.authorId === `discord-${identity.discord_user_id}`)
    ));
    if (commentsMatch && request.method === "GET") {
      const result = await env.DB.prepare("SELECT id, event_id, author_member_id, author_name, author_public_id, content, created_at, deleted_at FROM event_comments WHERE event_id = ? ORDER BY created_at, id")
        .bind(id).all<StoredEventComment>();
      const reactionResult = await env.DB.prepare(`SELECT r.comment_id, r.emoji, m.public_member_id
        FROM event_comment_reactions r JOIN members m ON m.id = r.member_id
        WHERE r.event_id = ? ORDER BY r.created_at`).bind(id).all<{ comment_id: string; emoji: string; public_member_id: string }>();
      const reactions: Record<string, Record<string, string[]>> = {};
      for (const reaction of reactionResult.results ?? []) {
        const commentReactions = reactions[reaction.comment_id] ?? (reactions[reaction.comment_id] = {});
        const memberIds = commentReactions[reaction.emoji] ?? (commentReactions[reaction.emoji] = []);
        if (!memberIds.includes(reaction.public_member_id)) memberIds.push(reaction.public_member_id);
      }
      const comments = mergeEventComments(imported, result.results ?? [], {
        memberId: member.id, publicId: memberPublicId, discordUserId: identity?.discord_user_id ?? null, elevated,
      }, reactions);
      return responseJson({ comments });
    }
    if (commentsMatch && request.method === "POST") {
      const input = await readBody(request);
      const content = text(input?.text, 5000, true);
      if (!content) return responseJson({ error: "コメントを入力してください" }, 400);
      const suppliedId = typeof input?.id === "string" && /^ec_\d{10,20}$/.test(input.id) ? input.id : null;
      const commentId = suppliedId ?? `ec_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const duplicateSince = new Date(Date.parse(now) - 30_000).toISOString();
      const duplicate = await env.DB.prepare(`SELECT id, event_id, author_member_id, author_name, author_public_id, content, created_at, deleted_at FROM event_comments
        WHERE event_id = ? AND author_member_id = ? AND content = ? AND deleted_at IS NULL AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1`).bind(id, member.id, content, duplicateSince).first<StoredEventComment>();
      if (duplicate) return responseJson({ comment: { id: duplicate.id, author: duplicate.author_name, authorId: duplicate.author_public_id, text: duplicate.content, createdAt: duplicate.created_at, canEdit: true, reactions: {} }, duplicate: true });
      await env.DB.prepare(`INSERT OR IGNORE INTO event_comments
        (id, event_id, author_member_id, author_name, author_public_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(commentId, id, member.id, identity?.display_name?.trim() || "メンバー", memberPublicId, content, now, now).run();
      const saved = await env.DB.prepare("SELECT id, event_id, author_member_id, author_name, author_public_id, content, created_at, deleted_at FROM event_comments WHERE id = ?")
        .bind(commentId).first<StoredEventComment>();
      if (!saved || saved.event_id !== id || saved.author_member_id !== member.id || saved.deleted_at) return responseJson({ error: "コメントを保存できませんでした" }, 409);
      const mentionNotifications = await eventMentionNotificationStatements(env.DB, {
        eventId: id,
        eventTitle: row.title,
        content,
        actorMemberId: member.id,
        now,
        notificationScope: `comment:${commentId}`,
        locationLabel: "コメント欄",
      });
      if (mentionNotifications.length) await env.DB.batch(mentionNotifications);
      return responseJson({ comment: { id: saved.id, author: saved.author_name, authorId: saved.author_public_id, text: saved.content, createdAt: saved.created_at, canEdit: true, reactions: {} } }, 201);
    }
    if (commentReactionMatch && (request.method === "PUT" || request.method === "DELETE")) {
      const commentId = decodeURIComponent(commentReactionMatch[2]);
      const source = imported.find((comment) => comment.id === commentId);
      const saved = await env.DB.prepare("SELECT id, deleted_at FROM event_comments WHERE id = ? AND event_id = ?")
        .bind(commentId, id).first<{ id: string; deleted_at: string | null }>();
      if ((!source && !saved) || saved?.deleted_at) return responseJson({ error: "コメントが見つかりません" }, 404);
      const input = await readBody(request);
      const emoji = text(input?.emoji, 32, true);
      if (!emoji) return responseJson({ error: "スタンプを選択してください" }, 400);
      if (request.method === "PUT") await env.DB.prepare(`INSERT OR IGNORE INTO event_comment_reactions
        (event_id, comment_id, member_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(id, commentId, member.id, emoji, new Date().toISOString()).run();
      else await env.DB.prepare("DELETE FROM event_comment_reactions WHERE event_id = ? AND comment_id = ? AND member_id = ? AND emoji = ?")
        .bind(id, commentId, member.id, emoji).run();
      const result = await env.DB.prepare(`SELECT r.emoji, m.public_member_id FROM event_comment_reactions r
        JOIN members m ON m.id = r.member_id WHERE r.event_id = ? AND r.comment_id = ? ORDER BY r.created_at`)
        .bind(id, commentId).all<{ emoji: string; public_member_id: string }>();
      const reactions: Record<string, string[]> = {};
      for (const reaction of result.results ?? []) {
        const memberIds = reactions[reaction.emoji] ?? (reactions[reaction.emoji] = []);
        if (!memberIds.includes(reaction.public_member_id)) memberIds.push(reaction.public_member_id);
      }
      return responseJson({ reactions });
    }
    if (commentMatch && (request.method === "PATCH" || request.method === "DELETE")) {
      const commentId = decodeURIComponent(commentMatch[2]);
      const source = imported.find((comment) => comment.id === commentId);
      const saved = await env.DB.prepare("SELECT id, event_id, author_member_id, author_name, author_public_id, content, created_at, deleted_at FROM event_comments WHERE id = ? AND event_id = ?")
        .bind(commentId, id).first<StoredEventComment>();
      if ((!source && !saved) || saved?.deleted_at) return responseJson({ error: "コメントが見つかりません" }, 404);
      if (!(elevated || (source ? ownsImported(source) : saved?.author_member_id === member.id)))
        return responseJson({ error: "このコメントを変更する権限がありません" }, 403);
      const now = new Date().toISOString();
      if (request.method === "PATCH") {
        const input = await readBody(request);
        const content = text(input?.text, 5000, true);
        if (!content) return responseJson({ error: "コメントを入力してください" }, 400);
        const previousContent = source?.text ?? saved?.content ?? "";
        if (saved) await env.DB.prepare("UPDATE event_comments SET content = ?, updated_at = ? WHERE id = ? AND event_id = ? AND deleted_at IS NULL")
          .bind(content, now, commentId, id).run();
        else await env.DB.prepare(`INSERT INTO event_comments
          (id, event_id, author_member_id, author_name, author_public_id, content, created_at, updated_at)
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`).bind(commentId, id, source!.author, source!.authorId ?? null, content, source!.createdAt, now).run();
        const mentionNotifications = await eventMentionNotificationStatements(env.DB, {
          eventId: id,
          eventTitle: row.title,
          content,
          previousContent,
          actorMemberId: member.id,
          now,
          notificationScope: `comment:${commentId}`,
          locationLabel: "コメント欄",
        });
        if (mentionNotifications.length) await env.DB.batch(mentionNotifications);
        return responseJson({ comment: { id: commentId, author: source?.author ?? saved?.author_name, authorId: source?.authorId ?? saved?.author_public_id, text: content, createdAt: source?.createdAt ?? saved?.created_at, canEdit: true, reactions: {} } });
      }
      if (saved) await env.DB.prepare("UPDATE event_comments SET deleted_at = ?, updated_at = ? WHERE id = ? AND event_id = ? AND deleted_at IS NULL")
        .bind(now, now, commentId, id).run();
      else await env.DB.prepare(`INSERT INTO event_comments
        (id, event_id, author_member_id, author_name, author_public_id, content, created_at, updated_at, deleted_at)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`).bind(commentId, id, source!.author, source!.authorId ?? null, source!.text, source!.createdAt, now, now).run();
      await audit(env.DB, member.id, "event.comment_deleted", id, { commentId });
      return responseJson({ success: true });
    }
    return responseJson({ error: "method_not_allowed" }, 405);
  }
  if (eventMatch && request.method === "PATCH") {
    const id = decodeURIComponent(eventMatch[1]);
    if (await isDeletedImportedEvent(env.DB, id)) return responseJson({ error: "イベントが見つかりません" }, 404);
    const row = await eventRow(env.DB, id) ?? await materializeImportedEvent(env.DB, id, elevated ? member.id : undefined);
    if (!row) return responseJson({ error: "イベントが見つかりません" }, 404);
    const input = await readBody(request);
    if (input?.action === "close_discord_recruitment") {
      if (!elevated && row.organizer_member_id !== member.id) return responseJson({ error: "募集終了に変更する権限がありません" }, 403);
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
      const channel = data.recruitmentChannel ?? (id.startsWith("discord-event-") ? "discord" : "app");
      if (channel !== "discord") return responseJson({ error: "Discord受付イベントのみ変更できます" }, 400);
      if (row.status === "cancelled") return responseJson({ error: "中止されたイベントです" }, 409);
      if (data.discordRecruitmentClosedAt) return responseJson({ event: await hydratedEvent(env.DB, row, member.id, elevated, memberPublicId) });
      const now = new Date().toISOString();
      data.discordRecruitmentClosedAt = now;
      await env.DB.batch([
        env.DB.prepare("UPDATE events SET status = 'full', public_data_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(data), now, id),
        env.DB.prepare(`INSERT INTO event_import_field_edits (event_id, field_name, edited_at, actor_member_id)
          VALUES (?, 'status', ?, ?) ON CONFLICT(event_id, field_name) DO UPDATE SET edited_at = excluded.edited_at, actor_member_id = excluded.actor_member_id`).bind(id, now, member.id),
        env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
          VALUES (?, 'event.discord_recruitment_closed', 'event', ?, '{}', ?)`).bind(String(member.id), id, now),
      ]);
      return responseJson({ event: await hydratedEvent(env.DB, (await eventRow(env.DB, id))!, member.id, elevated, memberPublicId) });
    }
    const canManageImportedEvent = id.startsWith("discord-event-") && elevated;
    if (input?.action === "reopen_recruitment") {
      if (!(admin || row.organizer_member_id === member.id || canManageImportedEvent)) return responseJson({ error: "イベント作成者または管理者のみ追加募集できます" }, 403);
      if (row.status === "cancelled" || row.status === "ended") return responseJson({ error: "終了したイベントは追加募集できません" }, 409);
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
      if (data.recruitmentChannel === "discord") return responseJson({ error: "Discord受付イベントはアプリで追加募集できません" }, 400);
      if (row.event_date < japanDateKey()) return responseJson({ error: "開催済みのイベントは追加募集できません" }, 409);
      const capacity = typeof data.capacity === "number" ? data.capacity : 0;
      const confirmed = await env.DB.prepare("SELECT COUNT(*) AS count FROM event_participations WHERE event_id = ? AND status IN ('confirmed','cancel_requested')").bind(id).first<{ count: number }>();
      if (!["undecided", "unlimited"].includes(String(data.capacityMode)) && (confirmed?.count ?? 0) >= capacity) return responseJson({ error: "募集定員に空きがありません" }, 409);
      if (row.status === "open") return responseJson({ event: await hydratedEvent(env.DB, row, member.id, elevated, memberPublicId) });
      const now = new Date().toISOString();
      if (data.participantsFinalizedAt) {
        data.previouslyFinalizedParticipantIds = [...new Set([...(Array.isArray(data.previouslyFinalizedParticipantIds) ? data.previouslyFinalizedParticipantIds : []), ...((await env.DB.prepare("SELECT member_id FROM event_participations WHERE event_id = ? AND status IN ('confirmed','cancel_requested')").bind(id).all<{ member_id: number }>()).results ?? []).map((item) => item.member_id)])];
        delete data.participantsFinalizedAt;
      }
      data.recruitmentStatus = "open";
      await env.DB.batch([
        env.DB.prepare("UPDATE events SET status = 'open', public_data_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(data), now, id),
        env.DB.prepare("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, 'event.recruitment_reopened', 'event', ?, '{}', ?)").bind(String(member.id), id, now),
      ]);
      return responseJson({ event: await hydratedEvent(env.DB, (await eventRow(env.DB, id))!, member.id, elevated, memberPublicId) });
    }
    if (input?.action === "start_recruitment" || input?.action === "set_recruitment_status") {
      if (!admin) return responseJson({ error: "募集ステータスの変更は管理者のみ実行できます" }, 403);
      if (row.event_type !== "official") return responseJson({ error: "公式イベントのみ募集ステータスを変更できます" }, 400);
      const recruitmentStatus = input?.action === "start_recruitment" ? "open" : input?.recruitmentStatus;
      if (recruitmentStatus !== "draft" && recruitmentStatus !== "open") return responseJson({ error: "募集ステータスが不正です" }, 400);
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
      if (data.recruitmentStatus === recruitmentStatus) return responseJson({ event: await hydratedEvent(env.DB, row, member.id, elevated, memberPublicId) });
      const previousRecruitmentStatus = data.recruitmentStatus;
      data.recruitmentStatus = recruitmentStatus;
      const now = new Date().toISOString();
      const mentionNotifications = previousRecruitmentStatus === "draft" && recruitmentStatus === "open"
        ? await eventMentionNotificationStatements(env.DB, {
          eventId: id,
          eventTitle: row.title,
          content: eventMentionContent(data),
          actorMemberId: member.id,
          now,
        })
        : [];
      await env.DB.batch([
        env.DB.prepare("UPDATE events SET public_data_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(data), now, id),
        env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
          VALUES (?, 'event.recruitment_status_changed', 'event', ?, ?, ?)`).bind(String(member.id), id, JSON.stringify({ recruitmentStatus }), now),
        ...mentionNotifications,
      ]);
      const updated = await eventRow(env.DB, id);
      return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId) });
    }
    if (input?.action === "update_companions") {
      if (!(admin || row.organizer_member_id === member.id || canManageImportedEvent)) return responseJson({ error: "イベント作成者または管理者のみ同席者を変更できます" }, 403);
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
      if (!(admin || row.organizer_member_id === member.id || canManageImportedEvent)) return responseJson({ error: "イベント作成者または管理者のみイベント情報を編集できます" }, 403);
      const rawTitle = text(input.title, 160, true);
      const title = rawTitle ? displayEventTitle(rawTitle) : null;
      const description = text(input.description, 5000);
      const participants = stringArray(input.participants, 100, 80) ?? [];
      const date = input.date === undefined ? undefined : text(input.date, 10, true);
      const time = input.time === undefined ? undefined : text(input.time, 5, true);
      const location = input.location === undefined ? undefined : text(input.location, 500, true);
      const capacityMode = input.capacityMode === undefined ? undefined : input.capacityMode === "undecided" || input.capacityMode === "unlimited" ? input.capacityMode : input.capacityMode === null ? null : false;
      const capacity = input.capacity === undefined ? undefined : number(input.capacity, capacityMode === "undecided" || capacityMode === "unlimited" ? 0 : 1, 100);
      const reservationCapacity = input.reservationCapacity === undefined ? undefined : number(input.reservationCapacity, 0, 101);
      const price = input.price === undefined ? undefined : text(input.price, 80);
      const priceMin = input.priceMin === undefined ? undefined : number(input.priceMin, 0, 300_000);
      const priceMax = input.priceMax === undefined ? undefined : number(input.priceMax, 0, 300_000);
      const applicationDeadline = input.applicationDeadline === undefined ? undefined : text(input.applicationDeadline, 10);
      const cancellationPolicy = input.cancellationPolicy === undefined ? undefined : text(input.cancellationPolicy, 2000);
      const tabelogUrl = input.tabelogUrl === undefined ? undefined : text(input.tabelogUrl, 500);
      const googleMapsUrl = input.googleMapsUrl === undefined ? undefined : text(input.googleMapsUrl, 500);
      const eventType = input.eventType === undefined ? row.event_type : ["official", "gourmet", "club"].includes(String(input.eventType)) ? String(input.eventType) as EventRow["event_type"] : null;
      // Official/gourmet events legitimately have no club ID. A NULL database
      // value must not make every edit fail with 400.
      const clubId = input.clubId === undefined ? (row.club_id ?? "") : text(input.clubId, 80);
      const restaurantName = input.restaurantName === undefined ? undefined : text(input.restaurantName, 160);
      const image = input.image === undefined ? undefined : text(input.image, 500, true);
      const genres = input.genres === undefined ? undefined : stringArray(input.genres, 20);
      const companionIds = input.companionIds === undefined ? undefined : stringArray(input.companionIds, 100, 40);
      const normalizedRankPrices = input.rankPrices === undefined ? undefined : rankPrices(input.rankPrices);
      const selectionMethod = input.selectionMethod === undefined ? undefined : input.selectionMethod === "lottery" ? "lottery" : input.selectionMethod === "first_come" ? "first_come" : null;
      const recruitmentStatus = input.recruitmentStatus === undefined ? undefined : input.recruitmentStatus === "draft" || input.recruitmentStatus === "open" ? input.recruitmentStatus : null;
      const recruitmentChannel = input.recruitmentChannel === undefined ? undefined : input.recruitmentChannel === "discord" || input.recruitmentChannel === "app" ? input.recruitmentChannel : null;
      const category = input.category === undefined ? undefined : ["all", "kanto", "kansai"].includes(String(input.category)) ? input.category : null;
      const prefecture = input.prefecture === undefined ? undefined : text(input.prefecture, 16);
      const tokyoArea = input.tokyoArea === undefined ? undefined : text(input.tokyoArea, 80);
      const publicNotes = input.publicNotes === undefined ? undefined : text(input.publicNotes, 5000);
      const privateMemo = input.privateMemo === undefined ? undefined : text(input.privateMemo, 5000);
      if (!title || description === null || (date !== undefined && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) || (time !== undefined && (typeof time !== "string" || !/^([01]\d|2[0-3]):(00|15|30|45)$/.test(time))) || location === null || capacity === null || capacityMode === false || (capacityMode && capacity !== undefined && capacity !== 0) || reservationCapacity === null || price === null || priceMin === null || priceMax === null || applicationDeadline === null || cancellationPolicy === null || tabelogUrl === null || googleMapsUrl === null || !eventType || clubId === null || restaurantName === null || (image !== undefined && (!image || !image.startsWith("/api/event-images/"))) || genres === null || companionIds === null || normalizedRankPrices === null || selectionMethod === null || recruitmentStatus === null || recruitmentChannel === null || category === null || prefecture === null || tokyoArea === null || publicNotes === null || privateMemo === null)
        return responseJson({ error: "変更内容が不正です" }, 400);
      if (eventType === "official" && !elevated) return responseJson({ error: "公式イベントは運営メンバーのみ設定できます" }, 403);
      if (eventType !== "official" && normalizedRankPrices && Object.keys(normalizedRankPrices).length > 0) return responseJson({ error: "ランク別料金は公式イベントのみ設定できます" }, 400);
      if (eventType === "club" && (!clubId || !await canMemberAccessClub(env.DB, clubId, member.id, admin))) return responseJson({ error: "所属している部活動のみ設定できます" }, 403);
      if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) return responseJson({ error: "予算の範囲が不正です" }, 400);
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(row.public_data_json) as Record<string, unknown>; } catch {}
      const previousData = { ...data };
      data.description = description;
      data.manualParticipantIds = participants;
      if (time !== undefined) data.time = time;
      if (location !== undefined) data.location = location;
      if (capacity !== undefined) data.capacity = capacity;
      if (capacityMode !== undefined) data.capacityMode = capacityMode || undefined;
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
      if (normalizedRankPrices !== undefined) data.rankPrices = normalizedRankPrices;
      if (selectionMethod !== undefined) data.selectionMethod = selectionMethod;
      if (eventType === "official" && recruitmentStatus !== undefined) data.recruitmentStatus = recruitmentStatus;
      if (recruitmentChannel !== undefined) data.recruitmentChannel = recruitmentChannel;
      if (eventType !== "official") delete data.recruitmentStatus;
      if (category !== undefined) data.category = category;
      if (prefecture !== undefined) data.prefecture = prefecture || undefined;
      if (tokyoArea !== undefined) data.tokyoArea = tokyoArea || undefined;
      if (publicNotes !== undefined) data.publicNotes = publicNotes || undefined;
      const effectiveDate = date ?? row.event_date;
      const effectiveTime = time ?? (typeof data.time === "string" && /^\d{2}:\d{2}$/.test(data.time) ? data.time : "00:00");
      const reopensFutureEvent = row.status === "ended" && new Date(`${effectiveDate}T${effectiveTime}:00+09:00`).getTime() > Date.now();
      const now = new Date().toISOString();
      const mentionsWerePublished = eventMentionsArePublished(row.event_type, previousData);
      const mentionNotifications = eventMentionsArePublished(eventType, data)
        ? await eventMentionNotificationStatements(env.DB, {
          eventId: id,
          eventTitle: title,
          content: eventMentionContent(data),
          previousContent: mentionsWerePublished ? eventMentionContent(previousData) : "",
          actorMemberId: member.id,
          now,
        })
        : [];
      await env.DB.batch([
        env.DB.prepare("UPDATE events SET title = ?, event_type = ?, club_id = ?, event_date = ?, status = ?, public_data_json = ?, private_memo = COALESCE(?, private_memo), updated_at = ? WHERE id = ?").bind(title, eventType, eventType === "club" ? clubId : null, effectiveDate, reopensFutureEvent ? "open" : row.status, JSON.stringify(data), privateMemo, now, id),
        ...["title", "description", "eventType", "clubId", "restaurantName", "image", "genres", "companionIds", "rankPrices", "selectionMethod", "recruitmentStatus", "recruitmentChannel", "category", "prefecture", "tokyoArea", "publicNotes", "privateMemo", "event_date", "time", "location", "capacity", "capacityMode", "reservationCapacity", "price", "priceMin", "priceMax", "applicationDeadline", "cancellationPolicy", "tabelogUrl", "googleMapsUrl", "manualParticipantIds"].map((field) => env.DB!.prepare(`INSERT INTO event_import_field_edits (event_id, field_name, edited_at, actor_member_id)
          VALUES (?, ?, ?, ?) ON CONFLICT(event_id, field_name) DO UPDATE SET edited_at = excluded.edited_at, actor_member_id = excluded.actor_member_id`).bind(id, field, now, member.id)),
        env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
          VALUES (?, 'event.edited', 'event', ?, ?, ?)`).bind(String(member.id), id, JSON.stringify({ participants: participants.length }), now),
        ...mentionNotifications,
      ]);
      const updated = await eventRow(env.DB, id);
      return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId) });
    }
    if (!(admin || row.organizer_member_id === member.id)) return responseJson({ error: "イベント作成者または管理者のみ操作できます" }, 403);
    if (input?.action !== "cancel") return responseJson({ error: "操作を選択してください" }, 400);
    if (input?.confirmedParticipantNotified !== true) return responseJson({ error: "参加確定者への事前連絡の確認が必要です" }, 400);
    if (row.status === "cancelled") return responseJson({ success: true, cancelled: true });
    const now = new Date().toISOString();
    const pendingPayments = await env.DB.prepare(`SELECT member_id FROM event_participations
      WHERE event_id = ? AND status = 'applied' AND payment_state = 'awaiting_payment'`)
      .bind(id).all<{ member_id: number }>();
    for (const pending of pendingPayments.results ?? []) {
      if (!await cancelEventCheckout(env.DB, env, id, pending.member_id))
        return responseJson({ error: "決済リンクを停止できませんでした。イベント中止前にSquareの状態を確認してください" }, 502);
    }
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
    if (!admin) return responseJson({ error: "イベントの削除は管理者のみ実行できます" }, 403);
    const row = await eventRow(env.DB, id);
    const imported = id.startsWith("discord-event-") && IMPORTED_DISCORD_EVENTS.some((event) => event.id === id);
    if (!row && !imported && !await isDeletedImportedEvent(env.DB, id)) return responseJson({ error: "イベントが見つかりません" }, 404);
    const payment = await env.DB.prepare("SELECT 1 AS exists FROM event_payment_checkouts WHERE event_id = ? LIMIT 1")
      .bind(id).first<{ exists: number }>();
    if (payment) return responseJson({ error: "決済記録のあるイベントは削除できません。中止処理と返金確認を行ってください" }, 409);
    const now = new Date().toISOString();
    // event_id の外部キーは ON DELETE CASCADE。中止と異なり履歴も含めて完全に削除する。
    await env.DB.batch([
      ...(id.startsWith("discord-event-") ? [env.DB.prepare("INSERT OR IGNORE INTO deleted_imported_events (event_id, deleted_at, deleted_by_member_id) VALUES (?, ?, ?)").bind(id, now, member.id)] : []),
      env.DB.prepare("DELETE FROM events WHERE id = ?").bind(id),
      env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, 'event.deleted', 'event', ?, ?, ?)`).bind(String(member.id), id, JSON.stringify({ title: row?.title ?? "Discord移行イベント" }), now),
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
    if ((existingData.recruitmentChannel ?? (id.startsWith("discord-event-") ? "discord" : "app")) === "discord")
      return responseJson({ error: "このイベントの参加申込はDiscordで受け付けています" }, 409);
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
    const previous = await env.DB.prepare("SELECT status FROM event_participations WHERE event_id = ? AND member_id = ? LIMIT 1")
      .bind(id, member.id).first<{ status: string }>();
    if (previous && ["applied", "confirmed", "cancel_requested"].includes(previous.status))
      return responseJson({ error: "このイベントには申込済みです" }, 409);
    const priorPayment = await env.DB.prepare("SELECT status FROM event_payment_checkouts WHERE event_id = ? AND member_id = ? LIMIT 1")
      .bind(id, member.id).first<{ status: string }>();
    if (priorPayment)
      return responseJson({ error: "以前の決済リンクがある申込は運営へお問い合わせください" }, 409);
    const capacity = typeof data.capacity === "number" ? data.capacity : 0;
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM event_participations
      WHERE event_id = ? AND (status IN ('confirmed', 'cancel_requested') OR (status = 'applied' AND payment_state = 'awaiting_payment'))`).bind(id).first<{ count: number }>();
    const immediate = row.event_type === "official" && data.selectionMethod !== "lottery";
    if (immediate && !["undecided", "unlimited"].includes(String(data.capacityMode)) && (count?.count ?? 0) >= capacity) return responseJson({ error: "募集は終了しています" }, 409);
    const now = new Date().toISOString();
    const requestedPoints = Number(input?.pointsToUse ?? 0);
    if (!Number.isInteger(requestedPoints) || requestedPoints < 0 || requestedPoints > 300_000)
      return responseJson({ error: "利用ポイントを確認してください" }, 400);
    const eventPaymentsEnabled = env.EVENT_PAYMENTS_ENABLED === "true";
    if (requestedPoints > 0 && !eventPaymentsEnabled)
      return responseJson({ error: "アプリ内決済の停止中は参加費にポイントを利用できません" }, 400);
    if (requestedPoints > 0 && row.event_type !== "official")
      return responseJson({ error: "イロタスポイントは公式イベントの参加費にのみ利用できます" }, 400);
    const rankRow = await env.DB.prepare("SELECT member_rank, discord_roles_json FROM members WHERE id = ?").bind(member.id).first<{ member_rank: string | null; discord_roles_json: string | null }>();
    const rankPrices = data.rankPrices && typeof data.rankPrices === "object" ? data.rankPrices as Record<string, unknown> : {};
    const memberRank = effectiveMemberRank(rankRow?.member_rank, rankRow?.discord_roles_json) ?? "regular";
    const eventPrice = priceNumber(rankPrices[memberRank] ?? data.price);
    if (requestedPoints > eventPrice) return responseJson({ error: "参加費を超えるポイントは利用できません" }, 400);
    const appOfficial = eventPaymentsEnabled && row.event_type === "official" && data.recruitmentChannel !== "discord" && !id.startsWith("discord-event-");
    const amountDue = appOfficial ? eventCheckoutAmount(data, memberRank, requestedPoints) : 0;
    if (appOfficial && amountDue === null) return responseJson({ error: "参加費を確認できません" }, 409);
    const paymentState = appOfficial && amountDue! > 0 ? immediate ? "awaiting_payment" : "awaiting_selection" : null;
    const status = immediate && !paymentState ? "confirmed" : "applied";
    let pointResult: Awaited<ReturnType<typeof applyEventPointDiscount>> | null = null;
    if (requestedPoints > 0) {
      pointResult = await applyEventPointDiscount(env.DB, id, member.id, requestedPoints, row.title, now);
      if (!pointResult.success) return responseJson({ error: "イロタスポイント残高が不足しています" }, 409);
    }
    if (status === "confirmed" && !id.startsWith("discord-event-") && data.recruitmentChannel !== "discord" && !(typeof data.chatId === "string" && data.chatId)) data.chatId = eventChatId(id);
    const capacityGuard = immediate && !["undecided", "unlimited"].includes(String(data.capacityMode));
    try {
      const participationWrite = env.DB.prepare(`INSERT INTO event_participations
        (event_id, member_id, status, payment_state, terms_accepted_at, applied_at, confirmed_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE ? = 0 OR (SELECT COUNT(*) FROM event_participations
          WHERE event_id = ? AND (status IN ('confirmed', 'cancel_requested')
            OR (status = 'applied' AND payment_state = 'awaiting_payment'))) < ?
        ON CONFLICT(event_id, member_id) DO UPDATE SET status = excluded.status,
          payment_state = excluded.payment_state,
          terms_accepted_at = excluded.terms_accepted_at, applied_at = excluded.applied_at,
          confirmed_at = excluded.confirmed_at, cancelled_at = NULL, updated_at = excluded.updated_at`)
        .bind(id, member.id, status, paymentState, now, now, status === "confirmed" ? now : null, now,
          capacityGuard ? 1 : 0, id, capacity);
      if (paymentState === "awaiting_payment") {
        await env.DB.batch([
          participationWrite,
          env.DB.prepare(`INSERT INTO event_payment_checkouts
            (id, event_id, member_id, item_name, amount_yen, points_used, status, created_at, updated_at)
            SELECT ?, ?, ?, ?, ?, ?, 'creating', ?, ?
            WHERE EXISTS (SELECT 1 FROM event_participations
              WHERE event_id = ? AND member_id = ? AND status = 'applied' AND payment_state = 'awaiting_payment')`).bind(
              crypto.randomUUID(), id, member.id, `IRO+ ${row.title}`.slice(0, 255), amountDue, requestedPoints, now, now, id, member.id,
            ),
        ]);
      } else await participationWrite.run();
    } catch (error) {
      if (pointResult && !pointResult.duplicate) await refundEventPointDiscount(env.DB, id, member.id, row.title, now);
      throw error;
    }
    const reserved = await env.DB.prepare("SELECT status, payment_state FROM event_participations WHERE event_id = ? AND member_id = ?")
      .bind(id, member.id).first<{ status: string; payment_state: string | null }>();
    if (reserved?.status !== status || (paymentState && reserved.payment_state !== paymentState)) {
      if (pointResult && !pointResult.duplicate) await refundEventPointDiscount(env.DB, id, member.id, row.title, now);
      return responseJson({ error: "募集終了のため申込を受け付けられませんでした" }, 409);
    }
    if (status === "confirmed") {
      await env.DB.prepare("UPDATE events SET public_data_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(data), now, id).run();
      const chatId = typeof data.chatId === "string" ? data.chatId : "";
      if (chatId && !id.startsWith("discord-event-") && data.recruitmentChannel !== "discord") {
        const targetName = await eventChatMemberName(env.DB, member.id);
        await env.DB.batch([
          env.DB.prepare(`INSERT OR IGNORE INTO chat_rooms
            (id, name, room_type, source_id, created_by_member_id, created_at, updated_at)
            VALUES (?, ?, 'event', ?, ?, ?, ?)`)
            .bind(chatId, row.title, id, row.organizer_member_id, now, now),
          env.DB.prepare(`INSERT INTO chat_room_members
            (room_id, member_id, member_role, joined_at, left_at)
            VALUES (?, ?, 'owner', ?, NULL)
            ON CONFLICT(room_id, member_id) DO UPDATE SET member_role = 'owner', left_at = NULL`)
            .bind(chatId, row.organizer_member_id, now),
          env.DB.prepare(`INSERT INTO chat_room_members
            (room_id, member_id, member_role, joined_at, left_at)
            VALUES (?, ?, 'member', ?, NULL)
            ON CONFLICT(room_id, member_id) DO UPDATE SET member_role = 'member', left_at = NULL`)
            .bind(chatId, member.id, now),
          env.DB.prepare(`INSERT OR IGNORE INTO chat_messages
            (id, room_id, sender_member_id, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`)
            .bind(`event-chat-welcome:${id}`, chatId, row.organizer_member_id,
              eventChatSystemContent(`「${row.title}」の参加者専用グループが作成されました`), now, now),
          env.DB.prepare(`INSERT OR IGNORE INTO chat_messages
            (id, room_id, sender_member_id, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`)
            .bind(`event-chat-join:${id}:${member.id}`, chatId, row.organizer_member_id,
              eventChatSystemContent(`${targetName}がチャットに参加しました`), now, now),
        ]);
      }
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
    const unpaidSelected = await env.DB.prepare(`SELECT COUNT(*) AS count FROM event_participations
      WHERE event_id = ? AND status = 'applied' AND payment_state = 'awaiting_payment'`)
      .bind(id).first<{ count: number }>();
    if ((unpaidSelected?.count ?? 0) > 0)
      return responseJson({ error: "決済待ちの参加者がいます。支払い完了または申込取消後に確定してください" }, 409);
    const now = new Date().toISOString();
    const chatId = typeof data.chatId === "string" && data.chatId ? data.chatId : eventChatId(id);
    const importedDiscordEvent = id.startsWith("discord-event-") || data.recruitmentChannel === "discord";
    if (!importedDiscordEvent) data.chatId = chatId;
    data.participantsFinalizedAt = now;
    const confirmed = await env.DB.prepare("SELECT member_id FROM event_participations WHERE event_id = ? AND status IN ('confirmed','cancel_requested')").bind(id).all<{ member_id: number }>();
    const previouslyFinalized = new Set(Array.isArray(data.previouslyFinalizedParticipantIds) ? data.previouslyFinalizedParticipantIds.filter((value): value is number => typeof value === "number") : []);
    data.previouslyFinalizedParticipantIds = [...new Set([...previouslyFinalized, ...(confirmed.results ?? []).map((participant) => participant.member_id)])];
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
      env.DB.prepare("UPDATE event_participations SET status = 'rejected', payment_state = NULL, cancelled_at = ?, updated_at = ? WHERE event_id = ? AND status = 'applied'").bind(now, now, id),
      ...(!importedDiscordEvent ? [env.DB.prepare(`INSERT OR IGNORE INTO chat_rooms (id, name, room_type, source_id, created_by_member_id, created_at, updated_at)
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
      ] : []),
      env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, 'event.participants_finalized', 'event', ?, ?, ?)`).bind(String(member.id), id, JSON.stringify({ chatId, count: confirmed.results?.length ?? 0, companionCount: companionMemberIds.size }), now),
    ]);
    for (const applicant of pendingApplicants.results ?? []) await refundEventPointDiscount(env.DB, id, applicant.member_id, row.title, now);
    for (const participant of confirmed.results ?? []) if (!previouslyFinalized.has(participant.member_id)) await notifyEventConfirmation(env.DB, participant.member_id, id, row.title);
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
      const participation = await env.DB.prepare("SELECT status, payment_state FROM event_participations WHERE event_id = ? AND member_id = ?")
        .bind(id, targetId).first<{ status: string; payment_state: string | null }>();
      if (!participation || !["applied", "cancelled", "rejected"].includes(participation.status))
        return responseJson({ error: "承認可能な参加申込が見つかりません" }, 409);
      if (participation.payment_state === "awaiting_payment")
        return responseJson({ error: "この参加者は決済待ちです" }, 409);
      const capacity = typeof data.capacity === "number" ? data.capacity : 0;
      const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM event_participations WHERE event_id = ?
        AND (status IN ('confirmed','cancel_requested') OR (status = 'applied' AND payment_state = 'awaiting_payment'))`).bind(id).first<{ count: number }>();
      if (!["undecided", "unlimited"].includes(String(data.capacityMode)) && (count?.count ?? 0) >= capacity) return responseJson({ error: "募集終了のため承認できません" }, 409);
      if (env.EVENT_PAYMENTS_ENABLED === "true" && row.event_type === "official" && data.recruitmentChannel !== "discord" && !id.startsWith("discord-event-")) {
        const targetRank = await env.DB.prepare("SELECT member_rank, discord_roles_json FROM members WHERE id = ?")
          .bind(targetId).first<{ member_rank: string | null; discord_roles_json: string | null }>();
        const usedPoints = await env.DB.prepare("SELECT amount FROM event_point_usages WHERE event_id = ? AND member_id = ? AND status = 'applied'")
          .bind(id, targetId).first<{ amount: number }>();
        const amountDue = eventCheckoutAmount(data, effectiveMemberRank(targetRank?.member_rank, targetRank?.discord_roles_json) ?? "regular", Number(usedPoints?.amount ?? 0));
        if (amountDue === null) return responseJson({ error: "参加費を確認できません" }, 409);
        if (amountDue > 0) {
          if (participation.status !== "applied") return responseJson({ error: "有料イベントは会員からの再申込が必要です" }, 409);
          const previousCheckout = await env.DB.prepare("SELECT id FROM event_payment_checkouts WHERE event_id = ? AND member_id = ? LIMIT 1")
            .bind(id, targetId).first<{ id: string }>();
          if (previousCheckout) return responseJson({ error: "以前の決済リンクがある申込は運営へお問い合わせください" }, 409);
          const limited = !["undecided", "unlimited"].includes(String(data.capacityMode));
          await env.DB.batch([
            env.DB.prepare(`UPDATE event_participations SET status = 'applied', payment_state = 'awaiting_payment',
              confirmed_at = NULL, cancelled_at = NULL, updated_at = ? WHERE event_id = ? AND member_id = ?
                AND status = 'applied' AND payment_state IS NOT 'awaiting_payment'
                AND (? = 0 OR (SELECT COUNT(*) FROM event_participations
                  WHERE event_id = ? AND (status IN ('confirmed','cancel_requested')
                    OR (status = 'applied' AND payment_state = 'awaiting_payment'))) < ?)`)
              .bind(now, id, targetId, limited ? 1 : 0, id, capacity),
            env.DB.prepare(`INSERT INTO event_payment_checkouts
              (id, event_id, member_id, item_name, amount_yen, points_used, status, created_at, updated_at)
              SELECT ?, ?, ?, ?, ?, ?, 'creating', ?, ?
              WHERE EXISTS (SELECT 1 FROM event_participations
                WHERE event_id = ? AND member_id = ? AND status = 'applied' AND payment_state = 'awaiting_payment')`).bind(
                crypto.randomUUID(), id, targetId, `IRO+ ${row.title}`.slice(0, 255), amountDue, Number(usedPoints?.amount ?? 0), now, now, id, targetId,
              ),
            env.DB.prepare(`INSERT OR IGNORE INTO in_app_notifications
              (id, target_member_id, type, title, body, event_id, created_at)
              SELECT ?, ?, 'event_payment_ready', ?, ?, ?, ?
              WHERE EXISTS (SELECT 1 FROM event_participations
                WHERE event_id = ? AND member_id = ? AND status = 'applied' AND payment_state = 'awaiting_payment')`)
              .bind(`event-payment-ready:${id}:${targetId}`, targetId, "参加費のお支払いへ進んでください", `「${row.title}」への参加は、Squareでの決済完了後に確定します。イベント詳細からお支払いください。`, id, now, id, targetId),
          ]);
          const selected = await env.DB.prepare("SELECT payment_state FROM event_participations WHERE event_id = ? AND member_id = ?")
            .bind(id, targetId).first<{ payment_state: string | null }>();
          if (selected?.payment_state !== "awaiting_payment") return responseJson({ error: "募集終了のため承認できません" }, 409);
          await audit(env.DB, member.id, "event.payment_requested", id, { targetId, amountDue });
          const updated = await eventRow(env.DB, id);
          return responseJson({ event: await hydratedEvent(env.DB, updated!, member.id, elevated, memberPublicId) });
        }
      }
      await env.DB.prepare(`UPDATE event_participations SET status = 'confirmed', payment_state = NULL, confirmed_at = ?, cancelled_at = NULL, updated_at = ?
        WHERE event_id = ? AND member_id = ? AND status IN ('applied','cancelled','rejected')`).bind(now, now, id, targetId).run();
      const chatId = typeof data.chatId === "string" && data.chatId ? data.chatId : eventChatId(id);
      const importedDiscordEvent = id.startsWith("discord-event-") || data.recruitmentChannel === "discord";
      if (!importedDiscordEvent) data.chatId = chatId;
      const targetName = await eventChatMemberName(env.DB, targetId);
      await env.DB.prepare("UPDATE events SET public_data_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(data), now, id).run();
      await env.DB.batch([
        ...(!importedDiscordEvent ? [env.DB.prepare(`INSERT OR IGNORE INTO chat_rooms (id, name, room_type, source_id, created_by_member_id, created_at, updated_at)
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
        ] : []),
      ]);
      await notifyEventConfirmation(env.DB, targetId, id, row.title);
    } else {
      const targetParticipation = await env.DB.prepare("SELECT status, payment_state FROM event_participations WHERE event_id = ? AND member_id = ?")
        .bind(id, targetId).first<{ status: string; payment_state: string | null }>();
      if (targetParticipation?.status === "applied" && targetParticipation.payment_state === "awaiting_payment" &&
          !await cancelEventCheckout(env.DB, env, id, targetId))
        return responseJson({ error: "決済リンクを停止できませんでした。Squareの状態を確認してください" }, 502);
      await env.DB.prepare(`UPDATE event_participations SET status = 'cancelled', payment_state = NULL, cancelled_at = ?, updated_at = ?
        WHERE event_id = ? AND member_id = ?`).bind(now, now, id, targetId).run();
      await env.DB.prepare("UPDATE events SET status = 'open', updated_at = ? WHERE id = ? AND status = 'full' AND COALESCE(json_extract(public_data_json, '$.participantsFinalizedAt'), '') = '' AND COALESCE(json_extract(public_data_json, '$.discordRecruitmentClosedAt'), '') = ''").bind(now, id).run();
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
    const participation = await env.DB.prepare("SELECT status, payment_state FROM event_participations WHERE event_id = ? AND member_id = ?").bind(id, member.id).first<{ status: string; payment_state: string | null }>();
    const now = new Date().toISOString();
    if (participation?.status === "applied") {
      if (participation.payment_state === "awaiting_payment" && !await cancelEventCheckout(env.DB, env, id, member.id))
        return responseJson({ error: "決済リンクを停止できませんでした。運営へお問い合わせください" }, 502);
      await env.DB.prepare("UPDATE event_participations SET status = 'cancelled', payment_state = NULL, cancelled_at = ?, updated_at = ? WHERE event_id = ? AND member_id = ? AND status = 'applied'")
        .bind(now, now, id, member.id).run();
      await refundEventPointDiscount(env.DB, id, member.id, row.title, now);
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
      env.DB, member.id, id, "イベントのキャンセル申請を送りました",
      `「${row.title}」のキャンセルを幹事へ申請しました。承認されるまで参加は確定したままです。`,
    );
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
      env.DB.prepare("UPDATE events SET status = 'open', updated_at = ? WHERE id = ? AND status = 'full' AND COALESCE(json_extract(public_data_json, '$.participantsFinalizedAt'), '') = '' AND COALESCE(json_extract(public_data_json, '$.discordRecruitmentClosedAt'), '') = ''").bind(now, id),
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
