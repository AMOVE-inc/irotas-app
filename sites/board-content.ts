import { authenticatedRequestMember } from "./auth";
import { canMemberAccessClub } from "./clubs";
import type { D1Database, SitesEnv } from "./platform-types";

const CONTENT_PATH = "/api/board/content";
const THREADS_PATH = "/api/board/threads";
const THREAD_PATH = /^\/api\/board\/threads\/([^/]+)$/;
const COMMENTS_PATH = /^\/api\/board\/threads\/([^/]+)\/comments$/;
const COMMENT_PATH = /^\/api\/board\/comments\/([^/]+)$/;
const REACTIONS_PATH = "/api/board/reactions";
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
  content: string;
  data_json: string;
  created_at: string;
  updated_at: string;
};
type ReactionRow = {
  target_type: "thread" | "comment";
  target_id: string;
  member_id: number;
  emoji: string;
};

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

function text(value: unknown, maximum: number, required = false) {
  if (typeof value !== "string") return required ? null : "";
  const normalized = value.normalize("NFKC").trim();
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
  return member.role === "admin" || member.access_role === "admin" || member.access_role === "operator";
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
  return {
    id: row.id,
    authorId: row.author_public_member_id ?? `member-${row.author_member_id}`,
    authorName: row.author_display_name?.trim() || "メンバー",
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
      .reduce<Record<string, { count: number; reacted: boolean }>>((summary, item) => {
        summary[item.emoji] ??= { count: 0, reacted: false };
        summary[item.emoji].count += 1;
        if (item.member_id === viewerId) summary[item.emoji].reacted = true;
        return summary;
      }, {}),
  };
}

function serializeComment(row: CommentRow, viewerId: number, reactions: ReactionRow[]) {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorId: row.author_public_member_id ?? `member-${row.author_member_id}`,
    authorName: row.author_display_name?.trim() || "メンバー",
    content: row.content,
    data: parseData(row.data_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reactions: reactions
      .filter((item) => item.target_type === "comment" && item.target_id === row.id)
      .reduce<Record<string, { count: number; reacted: boolean }>>((summary, item) => {
        summary[item.emoji] ??= { count: 0, reacted: false };
        summary[item.emoji].count += 1;
        if (item.member_id === viewerId) summary[item.emoji].reacted = true;
        return summary;
      }, {}),
  };
}

async function threadById(db: D1Database, id: string) {
  return db.prepare(`SELECT id, author_member_id, category, title, content, status, pinned,
      data_json, created_at, updated_at
    FROM board_threads WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(id).first<ThreadRow>();
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
  entityType: "board_thread" | "board_comment" | "board_reaction",
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
  const handled = url.pathname === CONTENT_PATH || url.pathname === THREADS_PATH ||
    url.pathname === REACTIONS_PATH || threadMatch || commentsMatch || commentMatch;
  if (!handled) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);
  const db = env.DB;

  if (url.pathname === CONTENT_PATH && request.method === "GET") {
    const categoryParam = url.searchParams.get("category");
    const category = categoryParam ? validCategory(categoryParam) : null;
    if (categoryParam && !category) return json({ error: "カテゴリが不正です" }, 400);
    if (category && !await canAccessBoardCategory(db, category, member))
      return json({ error: "この部活動の部員のみ閲覧できます" }, 403);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 200);
    const rows = category
      ? await db.prepare(`SELECT bt.*, m.public_member_id AS author_public_member_id,
          m.display_name AS author_display_name
        FROM board_threads bt JOIN members m ON m.id = bt.author_member_id
        WHERE bt.category = ? AND bt.deleted_at IS NULL
        ORDER BY bt.pinned DESC, bt.created_at DESC LIMIT ?`).bind(category, limit).all<ThreadRow>()
      : await db.prepare(`SELECT bt.*, m.public_member_id AS author_public_member_id,
          m.display_name AS author_display_name
        FROM board_threads bt JOIN members m ON m.id = bt.author_member_id
        WHERE bt.deleted_at IS NULL AND bt.category NOT LIKE 'club-club-%'
        ORDER BY bt.pinned DESC, bt.created_at DESC LIMIT ?`).bind(limit).all<ThreadRow>();
    const threads = rows.results ?? [];
    if (!threads.length) return json({ threads: [], comments: [] });
    const placeholders = threads.map(() => "?").join(",");
    const ids = threads.map((item) => item.id);
    const [commentResult, reactionResult] = await Promise.all([
      db.prepare(`SELECT bc.*, m.public_member_id AS author_public_member_id,
          m.display_name AS author_display_name
        FROM board_comments bc JOIN members m ON m.id = bc.author_member_id
        WHERE bc.thread_id IN (${placeholders}) AND bc.deleted_at IS NULL
        ORDER BY bc.created_at ASC`).bind(...ids).all<CommentRow>(),
      db.prepare(`SELECT target_type, target_id, member_id, emoji FROM board_reactions
        WHERE (target_type = 'thread' AND target_id IN (${placeholders}))
           OR (target_type = 'comment' AND target_id IN (
             SELECT id FROM board_comments WHERE thread_id IN (${placeholders}) AND deleted_at IS NULL
           ))`).bind(...ids, ...ids).all<ReactionRow>(),
    ]);
    const reactions = reactionResult.results ?? [];
    return json({
      threads: threads.map((item) => serializeThread(item, member.id, reactions)),
      comments: (commentResult.results ?? []).map((item) => serializeComment(item, member.id, reactions)),
    });
  }

  if (url.pathname === THREADS_PATH && request.method === "POST") {
    const input = await readBody(request);
    const category = validCategory(input?.category);
    const title = text(input?.title, 200, true);
    const content = text(input?.content, 10_000, true);
    const data = safeData(input?.data);
    const status = input?.status === "closed" || input?.status === "none" ? input.status : "open";
    if (!input || !category || !title || !content || data === null)
      return json({ error: "投稿内容が不正です" }, 400);
    if (!await canAccessBoardCategory(db, category, member))
      return json({ error: "この部活動の部員のみ投稿できます" }, 403);
    if (category === "gourmet-contest" && member.access_role !== "operator" && !elevated(member))
      return json({ error: "グルメ選手権は運営メンバーのみ作成できます" }, 403);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
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
    if (current.author_member_id !== member.id && !elevated(member))
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
    const content = input.content === undefined ? current.content : text(input.content, 10_000, true);
    const status = input.status === undefined ? current.status :
      input.status === "open" || input.status === "closed" || input.status === "none" ? input.status : null;
    const pinned = input.pinned === undefined ? current.pinned : input.pinned === true ? 1 : input.pinned === false ? 0 : null;
    const data = input.data === undefined ? current.data_json : safeData(input.data);
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
    const content = text(input?.content, 10_000, true);
    const data = safeData(input?.data);
    if (!input || !content || data === null) return json({ error: "コメント内容が不正です" }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO board_comments
      (id, thread_id, author_member_id, content, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, threadId, member.id, content, data, now, now).run();
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
    const content = input?.content === undefined ? current.content : text(input.content, 10_000, true);
    const data = input?.data === undefined ? current.data_json : safeData(input.data);
    if (!input || !content || data === null) return json({ error: "変更内容が不正です" }, 400);
    await db.prepare("UPDATE board_comments SET content = ?, data_json = ?, updated_at = ? WHERE id = ?")
      .bind(content, data, now, id).run();
    await audit(db, member.id, "board.comment_updated", "board_comment", id);
    return json({ success: true, updatedAt: now });
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
