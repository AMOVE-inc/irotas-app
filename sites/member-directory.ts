import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const DIRECTORY_ENDPOINT = "/api/members";
const MEMBER_PATH = /^\/api\/members\/([^/]+)(?:\/(private-note))?$/;

type MemberDirectoryRow = {
  id: number;
  public_member_id: string | null;
  display_name: string;
  access_role: "member" | "club_leader" | "operator" | "admin";
  branches_json: string;
  member_term: string | null;
  member_rank: string;
  achievement_badges_json: string;
  discord_joined_at: string | null;
  profile_json: string;
  xp: number;
  participation_count: number;
  organizer_count: number;
  created_at: string;
  subscription_started_at: string | null;
};

function jsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function jsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function publicMemberFromRow(row: MemberDirectoryRow) {
  return {
    id: row.public_member_id ?? `member-${row.id}`,
    userId: row.id,
    displayName: row.display_name,
    accessRole: row.access_role,
    branches: jsonArray(row.branches_json),
    memberTerm: row.member_term,
    memberRank: row.member_rank,
    achievementBadges: jsonArray(row.achievement_badges_json),
    joinedAt:
      row.subscription_started_at ?? row.discord_joined_at ?? row.created_at,
    profile: jsonObject(row.profile_json),
    xp: ["operator", "admin"].includes(row.access_role) ? 0 : row.xp,
    participationCount: row.participation_count,
    organizerCount: row.organizer_count,
  };
}

function responseJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

const publicMemberSelect = `
  SELECT m.id, m.public_member_id, m.display_name, m.access_role, m.branches_json,
         m.member_term, m.member_rank, m.achievement_badges_json,
         m.discord_joined_at, m.profile_json, m.xp, m.participation_count,
         m.organizer_count, m.created_at, s.subscription_started_at
  FROM members m
  LEFT JOIN member_subscriptions s ON s.member_id = m.id
  WHERE m.account_status = 'active'
    AND COALESCE(json_extract(m.profile_json, '$.isTestAccount'), 0) <> 1
    AND (m.access_role IN ('club_leader', 'operator', 'admin')
      OR s.access_status IN ('active', 'grace'))`;

async function findPublicMember(db: D1Database, key: string) {
  const numericId = /^member-(\d+)$/.exec(key)?.[1] ?? null;
  return db
    .prepare(
      `${publicMemberSelect}
       AND (m.public_member_id = ? OR m.id = ?)
       ORDER BY s.id DESC LIMIT 1`,
    )
    .bind(key, numericId)
    .first<MemberDirectoryRow>();
}

async function readNote(db: D1Database, ownerId: number, targetId: number) {
  const row = await db
    .prepare(
      "SELECT note, updated_at FROM member_private_notes WHERE owner_member_id = ? AND target_member_id = ?",
    )
    .bind(ownerId, targetId)
    .first<{ note: string; updated_at: string }>();
  return responseJson({ note: row?.note ?? "", updatedAt: row?.updated_at ?? null });
}

async function saveNote(
  request: Request,
  db: D1Database,
  ownerId: number,
  targetId: number,
) {
  const input = (await request.json()) as Record<string, unknown>;
  if (typeof input.note !== "string" || input.note.length > 5000)
    return responseJson({ error: "メモは5000文字以内で入力してください" }, 400);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO member_private_notes (owner_member_id, target_member_id, note, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(owner_member_id, target_member_id)
       DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
    )
    .bind(ownerId, targetId, input.note, now)
    .run();
  return responseJson({ success: true, updatedAt: now });
}

export async function handleMemberDirectoryRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const match = MEMBER_PATH.exec(pathname);
  if (pathname !== DIRECTORY_ENDPOINT && !match) return null;
  if (!env.DB) return responseJson({ error: "データベースに接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer) return responseJson({ error: "ログインが必要です" }, 401);

  if (pathname === DIRECTORY_ENDPOINT) {
    if (request.method !== "GET") return responseJson({ error: "method_not_allowed" }, 405);
    const rows = await env.DB.prepare(
      `${publicMemberSelect} ORDER BY m.display_name COLLATE NOCASE, m.id`,
    ).all<MemberDirectoryRow>();
    return responseJson({ members: (rows.results ?? []).map(publicMemberFromRow) });
  }

  const key = decodeURIComponent(match![1]);
  const member = await findPublicMember(env.DB, key);
  if (!member) return responseJson({ error: "メンバーが見つかりません" }, 404);

  if (match![2] === "private-note") {
    if (viewer.id === member.id)
      return responseJson({ error: "自分自身にはメモを保存できません" }, 400);
    if (request.method === "GET") return readNote(env.DB, viewer.id, member.id);
    if (request.method === "PATCH") return saveNote(request, env.DB, viewer.id, member.id);
    return responseJson({ error: "method_not_allowed" }, 405);
  }

  if (request.method !== "GET") return responseJson({ error: "method_not_allowed" }, 405);
  return responseJson({ member: publicMemberFromRow(member) });
}
