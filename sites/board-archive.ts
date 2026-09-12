import archive from "../data/discord-board-2026-08-29.json";
import { SEEDED_GOURMET_CONTESTS } from "../constants/imported-gourmet-contests";
import type {
  RawDiscordBoardArchive,
} from "../lib/discord-board-import";
import { isDiscordGourmetEventBoard, isRetiredMovieClubThread, normalizeDiscordBoardCategory } from "../lib/board-category";
import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const ARCHIVE_PATH = "/api/board/archive";
const CONTESTS_PATH = "/api/board/contests";

function isPrivateClubCategory(category: string) {
  return category.startsWith("club-club-");
}

export function filterBoardArchive(
  source: RawDiscordBoardArchive,
  allowedPrivateCategories: ReadonlySet<string>,
): RawDiscordBoardArchive {
  const threads = source.threads
    .filter((thread) => !isDiscordGourmetEventBoard(thread.category) && !isRetiredMovieClubThread(thread))
    .map((thread) => ({ ...thread, category: normalizeDiscordBoardCategory(thread.category) }))
    .filter((thread) => !isPrivateClubCategory(thread.category) || allowedPrivateCategories.has(thread.category));
  const threadIds = new Set(threads.map((thread) => thread.id));
  const comments = source.comments.filter((comment) => threadIds.has(comment.threadId));
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
  if (url.pathname !== ARCHIVE_PATH && url.pathname !== CONTESTS_PATH) return null;
  if (request.method !== "GET") {
    return Response.json({ error: "許可されていない操作です" }, { status: 405 });
  }
  if (!env.DB) {
    return Response.json({ error: "データベースに接続できません" }, { status: 503 });
  }
  const member = await authenticatedRequestMember(request, env);
  if (!member) {
    return Response.json({ error: "ログインが必要です" }, { status: 401 });
  }

  if (url.pathname === CONTESTS_PATH) {
    return Response.json({ contests: SEEDED_GOURMET_CONTESTS }, {
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
  const threadOverrides = Object.fromEntries((saved.results ?? [])
    .filter((row) => visibleIds.has(row.id) && !row.deleted_at)
    .map((row) => [row.id, {
      title: row.title, content: row.content, status: row.status, pinned: Boolean(row.pinned),
      updatedAt: row.updated_at, data: JSON.parse(row.data_json || "{}"),
    }]));
  return Response.json({ threads, comments: filtered.comments.filter((comment) => liveIds.has(comment.threadId)), threadOverrides }, {
    headers: {
      "cache-control": "private, no-store",
      vary: "Cookie, Authorization",
    },
  });
}
