import archive from "../data/discord-board-2026-08-29.json";
import introductionMemberMetadata from "../data/discord-introduction-member-metadata.json";
import { SEEDED_GOURMET_CONTESTS } from "../constants/imported-gourmet-contests";
import type {
  RawDiscordBoardArchive,
} from "../lib/discord-board-import";
import { isDiscordGourmetEventBoard, isRetiredMovieClubThread, normalizeDiscordBoardCategory } from "../lib/board-category";
import { inferImportedRecruitmentStatus } from "../lib/board-recruitment";
import { authenticatedRequestMember } from "./auth";
import { importedMediaPaths } from "../lib/imported-media-path";
import type { D1Database, SitesEnv } from "./platform-types";

const ARCHIVE_PATH = "/api/board/archive";
const INTRODUCTION_PROFILE_PATH = "/api/board/introduction-profile";
const INTRODUCTION_REACTIONS_PATH = "/api/board/introduction-reactions";
const CONTESTS_PATH = "/api/board/contests";

const introductionThreads = (archive as RawDiscordBoardArchive).threads.filter((thread) => thread.category === "introduction");
const introductionThreadIds = new Set(introductionThreads.map((thread) => thread.id));
const introductionRecordIds = new Set([
  ...introductionThreadIds,
  ...(archive as RawDiscordBoardArchive).comments.filter((comment) => introductionThreadIds.has(comment.threadId)).map((comment) => comment.id),
]);

export function archivedIntroductionProfile(authorId: string) {
  const introduction = (archive as RawDiscordBoardArchive).threads
    .filter((thread) => thread.category === "introduction" && thread.authorId === authorId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!introduction) return null;
  const metadata = (introductionMemberMetadata as Record<string, { memberTerm?: string | null; joinedAt?: string | null }>)[authorId];
  return { name: introduction.authorName, avatarUrl: introduction.authorAvatarUrl ?? "", bio: introduction.content,
    memberTerm: metadata?.memberTerm ?? null, joinedAt: metadata?.joinedAt ?? null };
}

function isPrivateClubCategory(category: string) {
  return category.startsWith("club-club-");
}

export function filterBoardArchive(
  source: RawDiscordBoardArchive,
  allowedPrivateCategories: ReadonlySet<string>,
): RawDiscordBoardArchive {
  const threads = source.threads
    .filter((thread) => !isDiscordGourmetEventBoard(thread.category) && !isRetiredMovieClubThread(thread))
    .map((thread) => ({ ...thread, category: normalizeDiscordBoardCategory(thread.category), images: importedMediaPaths(thread.images) }))
    .filter((thread) => !isPrivateClubCategory(thread.category) || allowedPrivateCategories.has(thread.category));
  const threadIds = new Set(threads.map((thread) => thread.id));
  const comments = source.comments.filter((comment) => threadIds.has(comment.threadId))
    .map((comment) => ({ ...comment, images: importedMediaPaths(comment.images) }));
  return { threads, comments };
}

export async function allowedPrivateClubCategories(
  db: D1Database,
  memberId: number,
): Promise<Set<string>> {
  const result = await db
    .prepare(
      `SELECT DISTINCT c.id
      FROM clubs c
      LEFT JOIN club_memberships cm
        ON cm.club_id = c.id
       AND cm.member_id = ?
       AND cm.status = 'approved'
      WHERE c.status = 'active'
        AND (c.leader_member_id = ? OR cm.member_id IS NOT NULL)`,
    )
    .bind(memberId, memberId)
    .all<{ id: string }>();
  return new Set((result.results ?? []).map((row) => `club-${row.id}`));
}

export async function handleBoardArchiveRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== ARCHIVE_PATH && url.pathname !== CONTESTS_PATH && url.pathname !== INTRODUCTION_PROFILE_PATH && url.pathname !== INTRODUCTION_REACTIONS_PATH) return null;
  if (request.method !== "GET" && !(url.pathname === INTRODUCTION_REACTIONS_PATH && ["PUT", "DELETE"].includes(request.method))) {
    return Response.json({ error: "許可されていない操作です" }, { status: 405 });
  }
  if (!env.DB) {
    return Response.json({ error: "データベースに接続できません" }, { status: 503 });
  }
  const member = await authenticatedRequestMember(request, env);
  if (!member) {
    return Response.json({ error: "ログインが必要です" }, { status: 401 });
  }

  if (url.pathname === INTRODUCTION_REACTIONS_PATH) {
    const headers = { "cache-control": "private, no-store", vary: "Cookie, Authorization" };
    if (request.method !== "GET") {
      if (Number(request.headers.get("content-length") ?? 0) > 4096)
        return Response.json({ error: "入力が長すぎます" }, { status: 413, headers });
      let input: { sourceId?: unknown; emoji?: unknown };
      try {
        const raw = await request.text();
        if (raw.length > 4096) return Response.json({ error: "入力が長すぎます" }, { status: 413, headers });
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_body");
        input = parsed as { sourceId?: unknown; emoji?: unknown };
      }
      catch { return Response.json({ error: "入力が不正です" }, { status: 400, headers }); }
      const sourceId = typeof input.sourceId === "string" ? input.sourceId : "";
      const emoji = typeof input.emoji === "string" ? input.emoji.trim() : "";
      if (!introductionRecordIds.has(sourceId) || !emoji || [...emoji].length > 12)
        return Response.json({ error: "リアクションが不正です" }, { status: 400, headers });
      const sourceThreadId = introductionThreadIds.has(sourceId) ? sourceId :
        (archive as RawDiscordBoardArchive).comments.find((comment) => comment.id === sourceId)?.threadId;
      const deleted = await env.DB.prepare("SELECT deleted_at FROM board_threads WHERE id = ? LIMIT 1")
        .bind(sourceThreadId).first<{ deleted_at: string | null }>();
      if (deleted?.deleted_at) return Response.json({ error: "投稿が見つかりません" }, { status: 404, headers });
      if (request.method === "PUT") {
        await env.DB.prepare(`INSERT OR IGNORE INTO introduction_archive_reactions
          (source_id, member_id, emoji, created_at) VALUES (?, ?, ?, ?)`).bind(sourceId, member.id, emoji, new Date().toISOString()).run();
      } else {
        await env.DB.prepare("DELETE FROM introduction_archive_reactions WHERE source_id = ? AND member_id = ? AND emoji = ?")
          .bind(sourceId, member.id, emoji).run();
      }
    }
    const rows = await env.DB.prepare(`SELECT ir.source_id, ir.emoji, ir.member_id, m.public_member_id
      FROM introduction_archive_reactions ir JOIN members m ON m.id = ir.member_id`).all<{
      source_id: string; emoji: string; member_id: number; public_member_id: string | null;
    }>();
    const reactions: Record<string, Record<string, string[]>> = {};
    for (const row of rows.results ?? []) {
      if (!introductionRecordIds.has(row.source_id)) continue;
      reactions[row.source_id] ??= {};
      reactions[row.source_id][row.emoji] ??= [];
      reactions[row.source_id][row.emoji].push(row.public_member_id ?? `member-${row.member_id}`);
    }
    return Response.json({ reactions }, { headers });
  }

  if (url.pathname === CONTESTS_PATH) {
    return Response.json({ contests: SEEDED_GOURMET_CONTESTS }, {
      headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" },
    });
  }

  if (url.pathname === INTRODUCTION_PROFILE_PATH) {
    const authorId = url.searchParams.get("authorId")?.replace(/^discord-/, "");
    if (!authorId || !/^\d{17,20}$/.test(authorId)) return Response.json({ error: "メンバーが見つかりません" }, { status: 404 });
    const profile = archivedIntroductionProfile(authorId);
    if (!profile) return Response.json({ error: "メンバーが見つかりません" }, { status: 404 });
    return Response.json(profile, {
      headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" },
    });
  }

  const source = archive as RawDiscordBoardArchive;
  const publicOnly = url.searchParams.get("scope") === "public";
  const allowed = new Set<string>();
  const isAdmin = member.role === "admin" || member.access_role === "admin";
  if (!publicOnly) {
    if (isAdmin) {
      source.threads.forEach((thread) => {
        const category = normalizeDiscordBoardCategory(thread.category);
        if (isPrivateClubCategory(category) && !isRetiredMovieClubThread(thread)) allowed.add(category);
      });
    } else {
      const memberCategories = await allowedPrivateClubCategories(env.DB, member.id);
      memberCategories.forEach((category) => allowed.add(category));
    }
  }

  const filtered = filterBoardArchive(source, allowed);
  const visibleIds = new Set(filtered.threads.map((thread) => thread.id));
  const saved = await env.DB.prepare(`SELECT id, title, content, status, pinned, data_json, updated_at, deleted_at
    FROM board_threads WHERE id LIKE 'discord-board-%'`).all<{
    id: string; title: string; content: string; status: "open" | "closed" | "none";
    pinned: number; data_json: string; updated_at: string; deleted_at: string | null;
  }>();
  const deletedIds = new Set((saved.results ?? []).filter((row) => row.deleted_at).map((row) => row.id));
  const threads = filtered.threads.filter((thread) => !deletedIds.has(thread.id));
  const liveIds = new Set(threads.map((thread) => thread.id));
  const originalThreads = new Map(threads.map((thread) => [thread.id, thread]));
  const threadOverrides = Object.fromEntries((saved.results ?? [])
    .filter((row) => visibleIds.has(row.id) && !row.deleted_at)
    .map((row) => {
      const original = originalThreads.get(row.id);
      const category = original ? normalizeDiscordBoardCategory(original.category) : "";
      const inferredStatus = original ? inferImportedRecruitmentStatus(category, original.title, original.content) : "none";
      return [row.id, {
        title: row.title, content: row.content, status: row.status === "none" && inferredStatus === "closed" ? "closed" : row.status, pinned: Boolean(row.pinned),
        updatedAt: row.updated_at, data: JSON.parse(row.data_json || "{}"),
      }];
    }));
  return Response.json({ threads, comments: filtered.comments.filter((comment) => liveIds.has(comment.threadId)), threadOverrides }, {
    headers: {
      "cache-control": "private, no-store",
      vary: "Cookie, Authorization",
    },
  });
}
