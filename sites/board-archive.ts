import archive from "../data/discord-board-2026-08-14.json";
import type {
  RawDiscordBoardArchive,
  RawDiscordBoardThread,
} from "../lib/discord-board-import";
import { authenticatedRequestMember } from "./auth";
import { canMemberAccessClub } from "./clubs";
import type { SitesEnv } from "./platform-types";

const ARCHIVE_PATH = "/api/board/archive";

function isPrivateClubCategory(category: string) {
  return category.startsWith("club-club-");
}

export function filterBoardArchive(
  source: RawDiscordBoardArchive,
  allowedPrivateCategories: ReadonlySet<string>,
): RawDiscordBoardArchive {
  const threads = source.threads.filter(
    (thread) => !isPrivateClubCategory(thread.category) || allowedPrivateCategories.has(thread.category),
  );
  const threadIds = new Set(threads.map((thread) => thread.id));
  const comments = source.comments.filter((comment) => threadIds.has(comment.threadId));
  return { threads, comments };
}

export async function handleBoardArchiveRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== ARCHIVE_PATH) return null;
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

  const source = archive as RawDiscordBoardArchive;
  const publicOnly = url.searchParams.get("scope") === "public";
  const allowed = new Set<string>();
  const isAdmin = member.role === "admin" || member.access_role === "admin";
  if (!publicOnly) {
    const categories = [...new Set(
      source.threads
        .map((thread: RawDiscordBoardThread) => thread.category)
        .filter(isPrivateClubCategory),
    )];
    await Promise.all(categories.map(async (category) => {
      const clubId = category.slice("club-".length);
      if (isAdmin || await canMemberAccessClub(env.DB!, clubId, member.id, false)) {
        allowed.add(category);
      }
    }));
  }

  const filtered = filterBoardArchive(source, allowed);
  return Response.json(filtered, {
    headers: {
      "cache-control": "private, no-store",
      vary: "Cookie, Authorization",
    },
  });
}
