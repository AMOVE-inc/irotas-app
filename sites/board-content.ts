import { authenticatedRequestMember } from "./auth";
import { canMemberAccessClub } from "./clubs";
import type { D1Database, SitesEnv } from "./platform-types";
import archive from "../data/discord-board-2026-08-29.json";
import { IMPORTED_DISCORD_EVENTS } from "../constants/imported-discord-events";
import { cleanDiscordBoardContent, cleanDiscordBoardTitle } from "../lib/discord-board-normalization";
import { inferImportedRecruitmentStatus } from "../lib/board-recruitment";
import type { RawDiscordBoardArchive } from "../lib/discord-board-import";
import { isDiscordGourmetEventBoard, isRetiredMovieClubThread, normalizeDiscordBoardCategory } from "../lib/board-category";
import { replyReference, validReplyReference } from "../lib/reply-reference";

const gourmetEventBoardThreadIds = new Set((archive as RawDiscordBoardArchive).threads
  .filter((thread) => isDiscordGourmetEventBoard(thread.category)).map((thread) => thread.id));

const CONTENT_PATH = "/api/board/content";
const ACTIVITY_PATH = "/api/board/activity";
const THREADS_PATH = "/api/board/threads";
const THREAD_PATH = /^\/api\/board\/threads\/([^/]+)$/;
const COMMENTS_PATH = /^\/api\/board\/threads\/([^/]+)\/comments$/;
const COMMENT_PATH = /^\/api\/board\/comments\/([^/]+)$/;
const REACTIONS_PATH = "/api/board/reactions";
const POLL_PATH = /^\/api\/board\/polls\/(thread|comment)\/([^/]+)$/;
const IMPORTED_THREAD_ENSURE_PATH = /^\/api\/board\/imported-threads\/([^/]+)\/ensure$/;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_DATA_BYTES = 48 * 1024;
const PUBLIC_CATEGORIES = new Set([
  "introduction",
  "meal-report",
  "gourmet-report",
  "gourmet-contest",
  "gourmet-advice",
  "gourmet-consultation",
  "free-chat",
  "club-all",
  "club-introduction",
]);

type BoardMember = NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>;
type ThreadRow = {
  id: string;
  author_member_id: number;
  author_public_member_id: string | null;
  author_display_name: string | null;
  author_member_term: string | null;
  author_member_rank: string | null;
  author_profile_json: string | null;
  category: string;
  title: string;
  content: string;
  status: "open" | "closed" | "none";
  pinned: number;
  data_json: string;
  created_at: string;
  updated_at: string;
};
type CommentRow = {
  id: string;
  thread_id: string;
  author_member_id: number;
  author_public_member_id: string | null;
  author_display_name: string | null;
  author_member_term: string | null;
  author_member_rank: string | null;
  author_profile_json: string | null;
  content: string;
  data_json: string;
  created_at: string;
  updated_at: string;
};
type ReactionRow = {
  target_type: "thread" | "comment";
  target_id: string;
  member_id: number;
  public_member_id: string | null;
  emoji: string;
};
type PollOption = { id: string; text: string; voterIds: string[] };
type BoardPollData = { question: string; options: PollOption[]; deadline: string; allowMultiple?: boolean };

const discordAuthorFallbacks = new Map<string, { displayName?: string; avatarUrl?: string; memberRank?: string }>(
  IMPORTED_DISCORD_EVENTS.flatMap((event) => {
    const discordId = event.organizerProfileId?.match(/^discord-(\d{17,20})$/)?.[1];
    return discordId ? [[discordId, {
      displayName: event.organizerName,
      avatarUrl: event.organizerAvatar,
      memberRank: event.organizerRank,
    }] as const] : [];
  }),
);
for (const record of [...(archive as RawDiscordBoardArchive).threads, ...(archive as RawDiscordBoardArchive).comments]) {
  if (!record.authorId) continue;
  const current = discordAuthorFallbacks.get(record.authorId) ?? {};
  const rank = record.authorRank || (/PLATINUM|プラチナ/i.test(record.authorName) ? "platinum"
    : /GOLD|ゴールド/i.test(record.authorName) ? "gold"
      : /SILVER|シルバー/i.test(record.authorName) ? "silver"
        : undefined);
  discordAuthorFallbacks.set(record.authorId, {
    displayName: (current.displayName || record.authorName.replace(/\s*【[^】]*(?:SILVER|GOLD|PLATINUM)[^】]*】/gi, "").trim()).replace(/^deleted\s+user$/i, "未設定"),
    avatarUrl: current.avatarUrl || record.authorAvatarUrl || undefined,
    memberRank: current.memberRank || rank,
  });
}

export function discordAuthorFallbackFor(discordUserId: string) {
  return discordAuthorFallbacks.get(discordUserId);
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      vary: "Cookie, Authorization",
    },
  });
}

async function readBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function text(value: unknown, maximum: number, required = false, preserveUnicode = false) {
  if (typeof value !== "string") return required ? null : "";
  const normalized = (preserveUnicode ? value : value.normalize("NFKC")).trim();
  if ((required && !normalized) || normalized.length > maximum) return null;
  return normalized;
}

function safeData(value: unknown) {
  if (value === undefined) return "{}";
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const encoded = JSON.stringify(value);
    return new TextEncoder().encode(encoded).byteLength <= MAX_DATA_BYTES
      ? encoded
      : null;
  } catch {
    return null;
  }
}

function parseData(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function validPoll(value: unknown): BoardPollData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const poll = value as Record<string, unknown>;
  const question = text(poll.question, 300, true);
  const deadline = text(poll.deadline, 10, true);
  if (!question || !deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !Array.isArray(poll.options) || poll.options.length < 2 || poll.options.length > 10) return null;
  const options = poll.options.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const id = text(record.id, 80, true);
    const optionText = text(record.text, 300, true);
    return id && optionText ? { id, text: optionText, voterIds: [] } : null;
  });
  if (options.some((item) => !item)) return null;
  return { question, deadline, options: options as PollOption[], allowMultiple: poll.allowMultiple === true };
}

async function pollOwner(db: D1Database, ownerType: "thread" | "comment", ownerId: string) {
  return ownerType === "thread"
    ? db.prepare("SELECT bt.author_member_id, bt.category, bt.data_json FROM board_threads bt WHERE bt.id = ? AND bt.deleted_at IS NULL").bind(ownerId).first<{ author_member_id: number; category: string; data_json: string }>()
    : db.prepare(`SELECT bc.author_member_id, bt.category, bc.data_json FROM board_comments bc
        JOIN board_threads bt ON bt.id = bc.thread_id
        WHERE bc.id = ? AND bc.deleted_at IS NULL AND bt.deleted_at IS NULL`).bind(ownerId).first<{ author_member_id: number; category: string; data_json: string }>();
}

async function hydratedPoll(db: D1Database, ownerType: "thread" | "comment", ownerId: string, poll: BoardPollData) {
  const votes = await db.prepare(`SELECT v.option_id, v.member_id, m.public_member_id
    FROM board_poll_votes v JOIN members m ON m.id = v.member_id
    WHERE v.owner_type = ? AND v.owner_id = ?`).bind(ownerType, ownerId).all<{ option_id: string; member_id: number; public_member_id: string | null }>();
  return {
    ...poll,
    options: poll.options.map((option) => ({
      ...option,
      voterIds: (votes.results ?? []).filter((vote) => vote.option_id === option.id).map((vote) => vote.public_member_id ?? `member-${vote.member_id}`),
    })),
  };
}

function validCategory(value: unknown) {
  if (typeof value !== "string") return null;
  const category = value.trim();
  if (PUBLIC_CATEGORIES.has(category)) return category;
  return /^club-club-[a-z0-9-]{1,48}$/.test(category) ? category : null;
}

function clubIdFromCategory(category: string) {
  return category.startsWith("club-") ? category.slice(5) : null;
}

function elevated(member: BoardMember) {
  return member.role === "admin" || member.role === "operator" || member.access_role === "admin" || member.access_role === "operator";
}

export async function canAccessBoardCategory(
  db: D1Database,
  category: string,
  member: BoardMember,
) {
  const clubId = clubIdFromCategory(category);
  if (!clubId || !category.startsWith("club-club-")) return true;
  return canMemberAccessClub(db, clubId, member.id, elevated(member));
}

function serializeThread(row: ThreadRow, viewerId: number, reactions: ReactionRow[]) {
  const profile = parseData(row.author_profile_json ?? "{}");
  return {
    id: row.id,
    authorId: row.author_public_member_id ?? `member-${row.author_member_id}`,
    authorName: row.author_display_name?.trim() || "メンバー",
    authorAvatarUrl: typeof profile.avatarUrl === "string" ? profile.avatarUrl : undefined,
    authorMemberTerm: row.author_member_term ?? undefined,
    authorRank: row.author_member_rank ?? "regular",
    category: row.category,
    title: row.title,
    content: row.content,
    status: row.status,
    pinned: Boolean(row.pinned),
    data: parseData(row.data_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reactions: reactions
      .filter((item) => item.target_type === "thread" && item.target_id === row.id)
      .reduce<Record<string, { count: number; reacted: boolean; memberIds: string[] }>>((summary, item) => {
        summary[item.emoji] ??= { count: 0, reacted: false, memberIds: [] };
        summary[item.emoji].count += 1;
        summary[item.emoji].memberIds.push(item.public_member_id ?? `member-${item.member_id}`);
        if (item.member_id === viewerId) summary[item.emoji].reacted = true;
        return summary;
      }, {}),
  };
}

function serializeComment(row: CommentRow, viewerId: number, reactions: ReactionRow[]) {
  const profile = parseData(row.author_profile_json ?? "{}");
  return {
    id: row.id,
    threadId: row.thread_id,
    authorId: row.author_public_member_id ?? `member-${row.author_member_id}`,
    authorName: row.author_display_name?.trim() || "メンバー",
    authorAvatarUrl: typeof profile.avatarUrl === "string" ? profile.avatarUrl : undefined,
    authorMemberTerm: row.author_member_term ?? undefined,
    authorRank: row.author_member_rank ?? "regular",
    content: row.content,
    data: parseData(row.data_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reactions: reactions
      .filter((item) => item.target_type === "comment" && item.target_id === row.id)
      .reduce<Record<string, { count: number; reacted: boolean; memberIds: string[] }>>((summary, item) => {
        summary[item.emoji] ??= { count: 0, reacted: false, memberIds: [] };
        summary[item.emoji].count += 1;
        summary[item.emoji].memberIds.push(item.public_member_id ?? `member-${item.member_id}`);
        if (item.member_id === viewerId) summary[item.emoji].reacted = true;
        return summary;
      }, {}),
  };
}

async function threadById(db: D1Database, id: string) {
  if (gourmetEventBoardThreadIds.has(id)) return null;
  return db.prepare(`SELECT id, author_member_id, category, title, content, status, pinned,
      data_json, created_at, updated_at
    FROM board_threads WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(id).first<ThreadRow>();
}

async function restoreDiscordThreadAuthor(db: D1Database, row: ThreadRow): Promise<ThreadRow> {
  if (!row.id.startsWith("discord-board-")) return row;
  const raw = (archive as RawDiscordBoardArchive).threads.find((thread) => thread.id === row.id);
  if (!raw?.authorId) return row;
  const linked = await db.prepare(`SELECT id, public_member_id, display_name, member_term, member_rank, profile_json
    FROM members WHERE discord_user_id = ? LIMIT 1`).bind(raw.authorId).first<{
      id: number; public_member_id: string | null; display_name: string | null; member_term: string | null;
      member_rank: string | null; profile_json: string | null;
    }>();
  if (!linked) {
    const fallback = discordAuthorFallbackFor(raw.authorId);
    return {
      ...row,
      author_public_member_id: `discord-${raw.authorId}`,
      author_display_name: fallback?.displayName || raw.authorName,
      author_member_rank: fallback?.memberRank || row.author_member_rank,
      author_profile_json: fallback?.avatarUrl
        ? JSON.stringify({ ...parseData(row.author_profile_json ?? "{}"), avatarUrl: fallback.avatarUrl })
        : row.author_profile_json,
    };
  }
  return { ...row, author_member_id: linked.id, author_public_member_id: linked.public_member_id,
    author_display_name: linked.display_name, author_member_term: linked.member_term,
    author_member_rank: linked.member_rank, author_profile_json: linked.profile_json };
}

async function ensureImportedThread(
  db: D1Database,
  id: string,
  member: BoardMember,
) {
  const raw = (archive as RawDiscordBoardArchive).threads.find((thread) => thread.id === id);
  if (!raw || isDiscordGourmetEventBoard(raw.category) || isRetiredMovieClubThread(raw)) return null;
  const existing = await threadById(db, id);
  // Discord断面の再取得時も、同じスレッドIDがアプリDBに存在する場合は
  // アプリ側で編集された募集ステータス・固定状態・本文を一切上書きしない。
  if (existing) return existing;
  const category = validCategory(normalizeDiscordBoardCategory(raw.category));
  if (!category) return null;
  if (!await canAccessBoardCategory(db, category, member)) return null;
  const now = new Date().toISOString();
  const normalizedTitle = cleanDiscordBoardTitle(raw.title || "移行済み投稿");
  const normalizedContent = cleanDiscordBoardContent(raw.title, raw.content || "移行済み投稿", category);
  const initialStatus = inferImportedRecruitmentStatus(category, raw.title, normalizedContent);
  const linkedAuthor = raw.authorId ? await db.prepare("SELECT id FROM members WHERE discord_user_id = ? LIMIT 1")
    .bind(raw.authorId).first<{ id: number }>() : null;
  const authorMemberId = linkedAuthor?.id ?? member.id;
  await db.prepare(`INSERT OR IGNORE INTO board_threads
    (id, author_member_id, category, title, content, status, pinned, data_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`).bind(
      id,
      authorMemberId,
      category,
      normalizedTitle,
      normalizedContent,
      initialStatus,
      JSON.stringify({
        archiveShadow: true,
        sourceThreadId: id,
        migrationPolicy: {
          preserveAppManagedFields: ["status", "pinned", "title", "content", "data_json"],
          appendOnlyFields: ["comments"],
        },
      }),
      raw.createdAt || now,
      now,
    ).run();
  return {
    id,
    author_member_id: authorMemberId,
    author_public_member_id: null,
    author_display_name: null,
    category,
    title: normalizedTitle,
    content: normalizedContent,
    status: initialStatus,
    pinned: 0,
    data_json: JSON.stringify({
      archiveShadow: true,
      sourceThreadId: id,
      migrationPolicy: {
        preserveAppManagedFields: ["status", "pinned", "title", "content", "data_json"],
        appendOnlyFields: ["comments"],
      },
    }),
    created_at: raw.createdAt || now,
    updated_at: now,
  };
}

async function targetOwner(db: D1Database, targetType: string, id: string) {
  const table = targetType === "thread" ? "board_threads" : "board_comments";
  return db.prepare(`SELECT author_member_id FROM ${table} WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(id).first<{ author_member_id: number }>();
}

async function audit(
  db: D1Database,
  actorId: number,
  action: string,
  entityType: "board_thread" | "board_comment" | "board_reaction" | "board_poll",
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  await db.prepare(`INSERT INTO audit_logs
    (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(String(actorId), action, entityType, entityId, JSON.stringify(metadata), new Date().toISOString()).run();
}

export async function handleBoardContentRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  const threadMatch = THREAD_PATH.exec(url.pathname);
  const commentsMatch = COMMENTS_PATH.exec(url.pathname);
  const commentMatch = COMMENT_PATH.exec(url.pathname);
  const importedThreadEnsureMatch = IMPORTED_THREAD_ENSURE_PATH.exec(url.pathname);
  const pollMatch = POLL_PATH.exec(url.pathname);
  const handled = url.pathname === CONTENT_PATH || url.pathname === ACTIVITY_PATH || url.pathname === THREADS_PATH ||
    url.pathname === REACTIONS_PATH || threadMatch || commentsMatch || commentMatch || importedThreadEnsureMatch || pollMatch;
  if (!handled) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);
  const db = env.DB;

  if (url.pathname === ACTIVITY_PATH && request.method === "GET") {
    const categoryParam = url.searchParams.get("category");
    const category = categoryParam ? validCategory(categoryParam) : null;
    if (categoryParam && !category) return json({ error: "カテゴリが不正です" }, 400);
    if (category && !await canAccessBoardCategory(db, category, member))
      return json({ error: "この部活動の部員のみ閲覧できます" }, 403);
    const [threads, comments] = await Promise.all([
      category
        ? db.prepare("SELECT COUNT(*) AS count, MAX(updated_at) AS latest FROM board_threads WHERE category = ? AND deleted_at IS NULL").bind(category).first<{ count: number; latest: string | null }>()
        : db.prepare("SELECT COUNT(*) AS count, MAX(updated_at) AS latest FROM board_threads WHERE category NOT LIKE 'club-club-%' AND deleted_at IS NULL").first<{ count: number; latest: string | null }>(),
      category
        ? db.prepare(`SELECT COUNT(*) AS count, MAX(bc.updated_at) AS latest FROM board_comments bc JOIN board_threads bt ON bt.id = bc.thread_id
            WHERE bt.category = ? AND bt.deleted_at IS NULL AND bc.deleted_at IS NULL`).bind(category).first<{ count: number; latest: string | null }>()
        : db.prepare(`SELECT COUNT(*) AS count, MAX(bc.updated_at) AS latest FROM board_comments bc JOIN board_threads bt ON bt.id = bc.thread_id
            WHERE bt.category NOT LIKE 'club-club-%' AND bt.deleted_at IS NULL AND bc.deleted_at IS NULL`).first<{ count: number; latest: string | null }>(),
    ]);
    return json({ revision: `${threads?.count ?? 0}:${threads?.latest ?? ""}:${comments?.count ?? 0}:${comments?.latest ?? ""}` });
  }

  if (pollMatch && (request.method === "GET" || request.method === "PUT")) {
    const ownerType = pollMatch[1] as "thread" | "comment";
    const ownerId = decodeURIComponent(pollMatch[2]);
    const owner = await pollOwner(db, ownerType, ownerId);
    if (!owner || !await canAccessBoardCategory(db, owner.category, member)) return json({ error: "投票が見つかりません" }, 404);
    const poll = validPoll((parseData(owner.data_json) as Record<string, unknown>).poll);
    if (!poll) return json({ error: "投票が見つかりません" }, 404);
    const memberPublicId = await db.prepare("SELECT public_member_id FROM members WHERE id = ?").bind(member.id).first<{ public_member_id: string | null }>();
    if (request.method === "GET") return json({ poll: await hydratedPoll(db, ownerType, ownerId, poll), viewerMemberId: memberPublicId?.public_member_id ?? `member-${member.id}` });
    if (Date.now() > new Date(`${poll.deadline}T23:59:59+09:00`).getTime()) return json({ error: "投票期間は終了しました" }, 409);
    const input = await readBody(request);
    const optionId = text(input?.optionId, 80, true);
    if (!optionId || !poll.options.some((option) => option.id === optionId)) return json({ error: "選択肢が不正です" }, 400);
    const selected = await db.prepare(`SELECT 1 AS present FROM board_poll_votes
      WHERE owner_type = ? AND owner_id = ? AND option_id = ? AND member_id = ?`).bind(ownerType, ownerId, optionId, member.id).first<{ present: number }>();
    const statements = [];
    if (!poll.allowMultiple) statements.push(db.prepare("DELETE FROM board_poll_votes WHERE owner_type = ? AND owner_id = ? AND member_id = ?").bind(ownerType, ownerId, member.id));
    else if (selected) statements.push(db.prepare("DELETE FROM board_poll_votes WHERE owner_type = ? AND owner_id = ? AND option_id = ? AND member_id = ?").bind(ownerType, ownerId, optionId, member.id));
    if (!selected) statements.push(db.prepare(`INSERT OR IGNORE INTO board_poll_votes
      (owner_type, owner_id, option_id, member_id, created_at) VALUES (?, ?, ?, ?, ?)`).bind(ownerType, ownerId, optionId, member.id, new Date().toISOString()));
    if (statements.length) await db.batch(statements);
    await audit(db, member.id, selected ? "board.poll_vote_removed" : "board.poll_vote_added", "board_poll", `${ownerType}:${ownerId}`, { optionId });
    return json({ poll: await hydratedPoll(db, ownerType, ownerId, poll), viewerMemberId: memberPublicId?.public_member_id ?? `member-${member.id}` });
  }

  if (importedThreadEnsureMatch && request.method === "POST") {
    const id = decodeURIComponent(importedThreadEnsureMatch[1]);
    if (!/^discord-board-[0-9]{10,30}$/.test(id)) return json({ error: "移行済み投稿が見つかりません" }, 404);
    const thread = await ensureImportedThread(db, id, member);
    if (!thread) return json({ error: "移行済み投稿が見つからないか、閲覧権限がありません" }, 404);
    await audit(db, member.id, "board.imported_thread_materialized", "board_thread", id);
    return json({ success: true, id });
  }

  if (threadMatch && request.method === "GET") {
    const id = decodeURIComponent(threadMatch[1]);
    const stored = await db.prepare("SELECT title, category, deleted_at FROM board_threads WHERE id = ? LIMIT 1")
      .bind(id).first<{ title: string; category: string; deleted_at: string | null }>();
    const imported = (archive as RawDiscordBoardArchive).threads.find((item) => item.id === id);
    const category = stored?.category ?? (imported ? normalizeDiscordBoardCategory(imported.category) : null);
    if (stored?.deleted_at || !category || !validCategory(category) || !await canAccessBoardCategory(db, category, member) ||
        (!stored && (!imported || isDiscordGourmetEventBoard(imported.category) || isRetiredMovieClubThread(imported))))
      return json({ error: "スレッドが見つかりません" }, 404);
    return json({ title: stored?.title ?? cleanDiscordBoardTitle(imported!.title), category });
  }

  if (url.pathname === CONTENT_PATH && request.method === "GET") {
    const categoryParam = url.searchParams.get("category");
    const category = categoryParam ? validCategory(categoryParam) : null;
    if (categoryParam && !category) return json({ error: "カテゴリが不正です" }, 400);
    if (category && !await canAccessBoardCategory(db, category, member))
      return json({ error: "この部活動の部員のみ閲覧できます" }, 403);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 200);
    // Previously materialized Discord event threads still have category=free-chat in D1.
    // Read past them without deleting or altering any app-managed data.
    const candidateLimit = limit + gourmetEventBoardThreadIds.size;
    const rows = category
      ? await db.prepare(`SELECT bt.*, m.public_member_id AS author_public_member_id,
          m.display_name AS author_display_name, m.member_term AS author_member_term,
          m.member_rank AS author_member_rank, m.profile_json AS author_profile_json
        FROM board_threads bt JOIN members m ON m.id = bt.author_member_id
        WHERE bt.category = ? AND bt.deleted_at IS NULL
        ORDER BY bt.pinned DESC, bt.created_at DESC LIMIT ?`).bind(category, candidateLimit).all<ThreadRow>()
      : await db.prepare(`SELECT bt.*, m.public_member_id AS author_public_member_id,
          m.display_name AS author_display_name, m.member_term AS author_member_term,
          m.member_rank AS author_member_rank, m.profile_json AS author_profile_json
        FROM board_threads bt JOIN members m ON m.id = bt.author_member_id
        WHERE bt.deleted_at IS NULL AND bt.category NOT LIKE 'club-club-%'
        ORDER BY bt.pinned DESC, bt.created_at DESC LIMIT ?`).bind(candidateLimit).all<ThreadRow>();
    const visibleRows = (rows.results ?? []).filter((row) => !gourmetEventBoardThreadIds.has(row.id)).slice(0, limit);
    const threads = await Promise.all(visibleRows.map((row) => restoreDiscordThreadAuthor(db, row)));
    if (!threads.length) return json({ threads: [], comments: [] });
    const placeholders = threads.map(() => "?").join(",");
    const ids = threads.map((item) => item.id);
    const [commentResult, reactionResult] = await Promise.all([
      db.prepare(`SELECT bc.*, m.public_member_id AS author_public_member_id,
          m.display_name AS author_display_name, m.member_term AS author_member_term,
          m.member_rank AS author_member_rank, m.profile_json AS author_profile_json
        FROM board_comments bc JOIN members m ON m.id = bc.author_member_id
        WHERE bc.thread_id IN (${placeholders}) AND bc.deleted_at IS NULL
        ORDER BY bc.created_at ASC`).bind(...ids).all<CommentRow>(),
      db.prepare(`SELECT br.target_type, br.target_id, br.member_id, br.emoji, m.public_member_id
        FROM board_reactions br JOIN members m ON m.id = br.member_id
        WHERE (br.target_type = 'thread' AND br.target_id IN (${placeholders}))
           OR (br.target_type = 'comment' AND br.target_id IN (
             SELECT id FROM board_comments WHERE thread_id IN (${placeholders}) AND deleted_at IS NULL
           ))`).bind(...ids, ...ids).all<ReactionRow>(),
    ]);
    const reactions = reactionResult.results ?? [];
    const comments = commentResult.results ?? [];
    const latestCommentAt = new Map<string, string>();
    comments.forEach((comment) => {
      const current = latestCommentAt.get(comment.thread_id);
      if (!current || comment.created_at > current) latestCommentAt.set(comment.thread_id, comment.created_at);
    });
    return json({
      threads: threads.map((item) => ({ ...serializeThread(item, member.id, reactions), lastActivityAt: latestCommentAt.get(item.id) ?? item.created_at })),
      comments: comments.map((item) => serializeComment(item, member.id, reactions)),
    });
  }

  if (url.pathname === THREADS_PATH && request.method === "POST") {
    const input = await readBody(request);
    const category = validCategory(input?.category);
    const title = text(input?.title, 200, true);
    const content = text(input?.content, 10_000, true, true);
    const data = safeData(input?.data);
    const status = input?.status === "closed" || input?.status === "none" ? input.status : "open";
    if (!input || !category || !title || !content || data === null)
      return json({ error: "投稿内容が不正です" }, 400);
    if (!await canAccessBoardCategory(db, category, member))
      return json({ error: "この部活動の部員のみ投稿できます" }, 403);
    if (category === "gourmet-contest" && member.access_role !== "operator" && !elevated(member))
      return json({ error: "グルメ選手権は運営メンバーのみ作成できます" }, 403);
    const now = new Date().toISOString();
    if (category === "introduction") {
      const duplicateSince = new Date(Date.parse(now) - 30_000).toISOString();
      const existing = await db.prepare(`SELECT id, created_at FROM board_threads
        WHERE author_member_id = ? AND category = 'introduction' AND content = ?
          AND deleted_at IS NULL AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1`)
        .bind(member.id, content, duplicateSince)
        .first<{ id: string; created_at: string }>();
      if (existing) return json({ id: existing.id, createdAt: existing.created_at, duplicate: true }, 200);
    }
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO board_threads
      (id, author_member_id, category, title, content, status, pinned, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
      .bind(id, member.id, category, title, content, status, data, now, now).run();
    await audit(db, member.id, "board.thread_created", "board_thread", id, { category });
    return json({ id, createdAt: now }, 201);
  }

  if (threadMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    const id = decodeURIComponent(threadMatch[1]);
    const current = await threadById(db, id);
    if (!current) return json({ error: "投稿が見つかりません" }, 404);
    if (!await canAccessBoardCategory(db, current.category, member))
      return json({ error: "この投稿を操作できません" }, 403);
    const importedAuthorId = id.startsWith("discord-board-")
      ? (archive as RawDiscordBoardArchive).threads.find((thread) => thread.id === id)?.authorId
      : undefined;
    const viewerDiscordId = importedAuthorId ? await db.prepare("SELECT discord_user_id FROM members WHERE id = ?")
      .bind(member.id).first<{ discord_user_id: string | null }>() : null;
    if (current.author_member_id !== member.id && !elevated(member) && (!importedAuthorId || viewerDiscordId?.discord_user_id !== importedAuthorId))
      return json({ error: "投稿者本人または管理者のみ変更できます" }, 403);
    const now = new Date().toISOString();
    if (request.method === "DELETE") {
      await db.prepare("UPDATE board_threads SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(now, now, id).run();
      await audit(db, member.id, "board.thread_deleted", "board_thread", id);
      return json({ success: true });
    }
    const input = await readBody(request);
    if (!input) return json({ error: "変更内容が不正です" }, 400);
    const title = input.title === undefined ? current.title : text(input.title, 200, true);
    const content = input.content === undefined ? current.content : text(input.content, 10_000, true, true);
    const status = input.status === undefined ? current.status :
      input.status === "open" || input.status === "closed" || input.status === "none" ? input.status : null;
    const pinned = input.pinned === undefined ? current.pinned : input.pinned === true ? 1 : input.pinned === false ? 0 : null;
    const data = input.data === undefined ? current.data_json : safeData(
      id.startsWith("discord-board-") && input.data && typeof input.data === "object" && !Array.isArray(input.data)
        ? { ...input.data, archiveShadow: true } : input.data,
    );
    if (!title || !content || !status || pinned === null || data === null)
      return json({ error: "変更内容が不正です" }, 400);
    await db.prepare(`UPDATE board_threads SET title = ?, content = ?, status = ?, pinned = ?,
      data_json = ?, updated_at = ? WHERE id = ?`)
      .bind(title, content, status, pinned, data, now, id).run();
    await audit(db, member.id, "board.thread_updated", "board_thread", id);
    return json({ success: true, updatedAt: now });
  }

  if (commentsMatch && request.method === "POST") {
    const threadId = decodeURIComponent(commentsMatch[1]);
    const thread = await threadById(db, threadId);
    if (!thread) return json({ error: "投稿が見つかりません" }, 404);
    if (!await canAccessBoardCategory(db, thread.category, member))
      return json({ error: "この投稿にはコメントできません" }, 403);
    const input = await readBody(request);
    const content = text(input?.content, 10_000, false, true);
    if (input?.data !== undefined && (!input.data || typeof input.data !== "object" || Array.isArray(input.data)))
      return json({ error: "コメント内容が不正です" }, 400);
    const rawData = (input?.data ?? {}) as Record<string, unknown>;
    const hasMedia = [rawData.images, rawData.videos].some((value) => Array.isArray(value) && value.length > 0);
    let replyTo = null;
    if (rawData.replyTo !== undefined) {
      const replyId = rawData.replyTo && typeof rawData.replyTo === "object" && "id" in rawData.replyTo ? (rawData.replyTo as { id?: unknown }).id : null;
      if (typeof replyId !== "string" || !replyId || replyId.length > 160)
        return json({ error: "返信元が不正です" }, 400);
      const source = await db.prepare(`SELECT bc.content, m.display_name FROM board_comments bc
        JOIN members m ON m.id = bc.author_member_id
        WHERE bc.id = ? AND bc.thread_id = ? AND bc.deleted_at IS NULL LIMIT 1`)
        .bind(replyId, threadId).first<{ content: string; display_name: string }>();
      if (source) replyTo = replyReference(replyId, source.display_name, source.content);
      else {
        const archived = (archive as RawDiscordBoardArchive).comments.find((comment) => comment.id === replyId && comment.threadId === threadId);
        if (archived) replyTo = replyReference(replyId, archived.authorName, archived.content, archived.images.length > 0);
      }
      if (!replyTo) return json({ error: "返信元が見つかりません" }, 404);
    }
    const data = safeData({ ...rawData, ...(replyTo ? { replyTo } : {}) });
    if (!input || (!content && !hasMedia) || data === null) return json({ error: "コメント内容が不正です" }, 400);
    const duplicateSince = new Date(Date.now() - 30_000).toISOString();
    const duplicate = await db.prepare(`SELECT id, created_at FROM board_comments
      WHERE thread_id = ? AND author_member_id = ? AND content = ? AND data_json = ?
        AND deleted_at IS NULL AND created_at >= ? ORDER BY created_at DESC LIMIT 1`)
      .bind(threadId, member.id, content, data, duplicateSince)
      .first<{ id: string; created_at: string }>();
    if (duplicate) return json({ id: duplicate.id, createdAt: duplicate.created_at, duplicate: true });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO board_comments
      (id, thread_id, author_member_id, content, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, threadId, member.id, content, data, now, now).run();
    if (thread.author_member_id !== member.id) {
      const author = await db.prepare("SELECT display_name FROM members WHERE id = ? LIMIT 1")
        .bind(member.id).first<{ display_name: string }>();
      const targetPath = `/board?category=${encodeURIComponent(thread.category)}&view=threads&thread=${encodeURIComponent(threadId)}`;
      await db.prepare(`INSERT OR IGNORE INTO in_app_notifications
        (id, target_member_id, type, title, body, target_path, created_at)
        VALUES (?, ?, 'comment', ?, ?, ?, ?)`).bind(
          `board-comment:${id}:${thread.author_member_id}`,
          thread.author_member_id,
          `「${thread.title.slice(0, 80)}」にコメントが届きました`,
          `${author?.display_name || "メンバー"}: ${content ? content.replace(/\s+/g, " ").slice(0, 160) : "写真・動画が届きました"}`,
          targetPath,
          now,
        ).run();
    }
    await audit(db, member.id, "board.comment_created", "board_comment", id, { threadId });
    return json({ id, createdAt: now }, 201);
  }

  if (commentMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    const id = decodeURIComponent(commentMatch[1]);
    const current = await db.prepare(`SELECT bc.*, bt.category
      FROM board_comments bc JOIN board_threads bt ON bt.id = bc.thread_id
      WHERE bc.id = ? AND bc.deleted_at IS NULL AND bt.deleted_at IS NULL LIMIT 1`)
      .bind(id).first<CommentRow & { category: string }>();
    if (!current) return json({ error: "コメントが見つかりません" }, 404);
    if (!await canAccessBoardCategory(db, current.category, member))
      return json({ error: "このコメントを操作できません" }, 403);
    if (current.author_member_id !== member.id && !elevated(member))
      return json({ error: "投稿者本人または管理者のみ変更できます" }, 403);
    const now = new Date().toISOString();
    if (request.method === "DELETE") {
      await db.prepare("UPDATE board_comments SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(now, now, id).run();
      await audit(db, member.id, "board.comment_deleted", "board_comment", id);
      return json({ success: true });
    }
    const input = await readBody(request);
    const content = input?.content === undefined ? current.content : text(input.content, 10_000, true, true);
    const previousReply = (parseData(current.data_json) as Record<string, unknown>).replyTo;
    const data = input?.data === undefined ? current.data_json :
      input.data && typeof input.data === "object" && !Array.isArray(input.data)
        ? safeData({ ...input.data, replyTo: validReplyReference(previousReply) ? previousReply : undefined })
        : null;
    if (!input || !content || data === null) return json({ error: "変更内容が不正です" }, 400);
    await db.prepare("UPDATE board_comments SET content = ?, data_json = ?, updated_at = ? WHERE id = ?")
      .bind(content, data, now, id).run();
    await audit(db, member.id, "board.comment_updated", "board_comment", id);
    return json({ success: true, updatedAt: now });
  }

  if (url.pathname === REACTIONS_PATH && request.method === "GET") {
    const threadId = text(url.searchParams.get("threadId"), 128, true);
    if (!threadId) return json({ error: "スレが指定されていません" }, 400);
    const thread = await threadById(db, threadId);
    if (!thread || !await canAccessBoardCategory(db, thread.category, member)) return json({ error: "スレが見つかりません" }, 404);
    const rows = await db.prepare(`SELECT br.target_type, br.target_id, br.member_id, br.emoji, m.public_member_id
      FROM board_reactions br JOIN members m ON m.id = br.member_id
      WHERE (br.target_type = 'thread' AND br.target_id = ?)
        OR (br.target_type = 'comment' AND br.target_id IN (
          SELECT id FROM board_comments WHERE thread_id = ? AND deleted_at IS NULL))`)
      .bind(threadId, threadId).all<ReactionRow>();
    const reactions: Record<string, Record<string, string[]>> = {};
    for (const row of rows.results ?? []) {
      const target = `${row.target_type}:${row.target_id}`;
      reactions[target] ??= {};
      reactions[target][row.emoji] ??= [];
      reactions[target][row.emoji].push(row.public_member_id ?? `member-${row.member_id}`);
    }
    return json({ reactions });
  }

  if (url.pathname === REACTIONS_PATH && (request.method === "PUT" || request.method === "DELETE")) {
    const input = await readBody(request);
    const targetType = input?.targetType === "thread" || input?.targetType === "comment" ? input.targetType : null;
    const targetId = text(input?.targetId, 128, true);
    const emoji = text(input?.emoji, 24, true);
    if (!targetType || !targetId || !emoji) return json({ error: "リアクションが不正です" }, 400);
    const owner = await targetOwner(db, targetType, targetId);
    if (!owner) return json({ error: "対象が見つかりません" }, 404);
    const categoryRow = targetType === "thread"
      ? await threadById(db, targetId)
      : await db.prepare(`SELECT bt.category FROM board_comments bc JOIN board_threads bt ON bt.id = bc.thread_id
          WHERE bc.id = ? AND bc.deleted_at IS NULL AND bt.deleted_at IS NULL LIMIT 1`)
        .bind(targetId).first<{ category: string }>();
    if (!categoryRow || !await canAccessBoardCategory(db, categoryRow.category, member))
      return json({ error: "この投稿を操作できません" }, 403);
    if (request.method === "DELETE") {
      await db.prepare("DELETE FROM board_reactions WHERE target_type = ? AND target_id = ? AND member_id = ? AND emoji = ?")
        .bind(targetType, targetId, member.id, emoji).run();
    } else {
      await db.prepare(`INSERT INTO board_reactions (target_type, target_id, member_id, emoji, created_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(target_type, target_id, member_id, emoji) DO NOTHING`)
        .bind(targetType, targetId, member.id, emoji, new Date().toISOString()).run();
    }
    await audit(db, member.id, request.method === "PUT" ? "board.reaction_added" : "board.reaction_removed",
      "board_reaction", `${targetType}:${targetId}`, { emoji });
    return json({ success: true });
  }

  return json({ error: "許可されていない操作です" }, 405);
}
