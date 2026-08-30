import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const DIRECTORY_ENDPOINT = "/api/members";
const SELF_PROFILE_ENDPOINT = "/api/members/me/profile";
const MEMBER_PATH = /^\/api\/members\/([^/]+)(?:\/(private-note))?$/;
const FOLLOW_PATH = /^\/api\/members\/([^/]+)\/follow$/;
const SOCIAL_PATH = /^\/api\/members\/([^/]+)\/(followers|following)$/;

const PROFILE_TEXT_LIMITS = {
  bio: 2000,
  gender: 10,
  birthDate: 10,
  hometown: 100,
  residence: 100,
  occupation: 200,
  hobbies: 1000,
  favoriteAlcohol: 500,
  dislikedFoods: 1000,
  allergies: 1000,
  drinkingLevel: 100,
  instagramUrl: 1000,
  tabelogUrl: 1000,
  favoriteRestaurants: 2000,
  desiredRestaurants: 2000,
  googleLocalGuideLevel: 100,
  avatarUrl: 2000,
} as const;

export function sanitizeProfileUpdate(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("プロフィール情報を確認してください");
  const source = input as Record<string, unknown>;
  const displayName = typeof source.displayName === "string" ? source.displayName.trim() : "";
  if (!displayName || displayName.length > 100)
    throw new Error("表示名は1〜100文字で入力してください");
  if (!source.profile || typeof source.profile !== "object" || Array.isArray(source.profile))
    throw new Error("プロフィール情報を確認してください");
  const rawProfile = source.profile as Record<string, unknown>;
  const profile: Record<string, unknown> = {};
  for (const [key, limit] of Object.entries(PROFILE_TEXT_LIMITS)) {
    const value = rawProfile[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > limit)
      throw new Error(`${key}の入力内容を確認してください`);
    profile[key] = value.trim();
  }
  if (rawProfile.showAge !== undefined) {
    if (typeof rawProfile.showAge !== "boolean") throw new Error("年齢公開設定を確認してください");
    profile.showAge = rawProfile.showAge;
  }
  if (rawProfile.favoriteCuisines !== undefined) {
    if (!Array.isArray(rawProfile.favoriteCuisines) || rawProfile.favoriteCuisines.length > 50 || rawProfile.favoriteCuisines.some((value) => typeof value !== "string" || value.length > 100))
      throw new Error("好きな料理ジャンルを確認してください");
    profile.favoriteCuisines = [...new Set(rawProfile.favoriteCuisines.map((value) => value.trim()).filter(Boolean))];
  }
  if (typeof profile.gender === "string" && !["", "male", "female", "other", "unset"].includes(profile.gender))
    throw new Error("性別を確認してください");
  if (typeof profile.birthDate === "string" && profile.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate))
    throw new Error("生年月日を確認してください");
  for (const key of ["instagramUrl", "tabelogUrl", "avatarUrl"] as const) {
    const value = profile[key];
    if (typeof value === "string" && value && !/^https?:\/\//i.test(value) && !(key === "avatarUrl" && value.startsWith("/api/event-images/")))
      throw new Error(`${key}は有効なURLを入力してください`);
  }
  return { displayName, profile };
}

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
  follower_count?: number;
  following_count?: number;
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

export function publicMemberFromRow(row: MemberDirectoryRow, relationship: { isFollowing?: boolean; followsViewer?: boolean } = {}) {
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
    followerCount: row.follower_count ?? 0,
    followingCount: row.following_count ?? 0,
    isFollowing: relationship.isFollowing === true,
    followsViewer: relationship.followsViewer === true,
    isFriend: relationship.isFollowing === true && relationship.followsViewer === true,
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
         m.organizer_count, m.created_at, s.subscription_started_at,
         (SELECT COUNT(*) FROM member_follows mf WHERE mf.followed_member_id = m.id) AS follower_count,
         (SELECT COUNT(*) FROM member_follows mf WHERE mf.follower_member_id = m.id) AS following_count
  FROM members m
  LEFT JOIN member_subscriptions s ON s.member_id = m.id
  WHERE m.account_status = 'active'
    AND COALESCE(json_extract(m.profile_json, '$.isTestAccount'), 0) <> 1
    AND (m.access_role IN ('club_leader', 'operator', 'admin')
      OR s.access_status IN ('active', 'grace'))`;

async function findPublicMember(db: D1Database, key: string) {
  const numericId = /^member-(\d+)$/.exec(key)?.[1] ?? null;
  const discordId = /^discord-(\d{17,20})$/.exec(key)?.[1] ?? null;
  return db
    .prepare(
      `${publicMemberSelect}
       AND (m.public_member_id = ? OR m.id = ? OR m.discord_user_id = ?)
       ORDER BY s.id DESC LIMIT 1`,
    )
    .bind(key, numericId, discordId)
    .first<MemberDirectoryRow>();
}

async function relationship(db: D1Database, viewerId: number, targetId: number) {
  const rows = await db.prepare(`SELECT follower_member_id, followed_member_id FROM member_follows
    WHERE (follower_member_id = ? AND followed_member_id = ?)
       OR (follower_member_id = ? AND followed_member_id = ?)`).bind(viewerId, targetId, targetId, viewerId)
    .all<{ follower_member_id: number; followed_member_id: number }>();
  const values = rows.results ?? [];
  return {
    isFollowing: values.some((row) => row.follower_member_id === viewerId && row.followed_member_id === targetId),
    followsViewer: values.some((row) => row.follower_member_id === targetId && row.followed_member_id === viewerId),
  };
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

async function updateSelfProfile(request: Request, db: D1Database, memberId: number) {
  let update: ReturnType<typeof sanitizeProfileUpdate>;
  try {
    update = sanitizeProfileUpdate(await request.json());
  } catch (error) {
    return responseJson({ error: error instanceof Error ? error.message : "プロフィール情報を確認してください" }, 400);
  }
  const current = await db.prepare("SELECT profile_json FROM members WHERE id = ?").bind(memberId).first<{ profile_json: string | null }>();
  if (!current) return responseJson({ error: "メンバーが見つかりません" }, 404);
  const mergedProfile = { ...jsonObject(current.profile_json ?? "{}"), ...update.profile };
  const now = new Date().toISOString();
  await db.prepare("UPDATE members SET display_name = ?, profile_json = ?, updated_at = ? WHERE id = ?")
    .bind(update.displayName, JSON.stringify(mergedProfile), now, memberId).run();
  await db.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
    VALUES (?, 'member.profile_updated', 'member', ?, '{}', ?)`).bind(memberId, String(memberId), now).run();
  return responseJson({ success: true, displayName: update.displayName, profile: mergedProfile, updatedAt: now });
}

export async function handleMemberDirectoryRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const match = MEMBER_PATH.exec(pathname);
  const followMatch = FOLLOW_PATH.exec(pathname);
  const socialMatch = SOCIAL_PATH.exec(pathname);
  if (pathname !== DIRECTORY_ENDPOINT && pathname !== SELF_PROFILE_ENDPOINT && !match && !followMatch && !socialMatch) return null;
  if (!env.DB) return responseJson({ error: "データベースに接続できません" }, 503);
  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer) return responseJson({ error: "ログインが必要です" }, 401);

  if (pathname === SELF_PROFILE_ENDPOINT) {
    if (request.method !== "PATCH") return responseJson({ error: "method_not_allowed" }, 405);
    return updateSelfProfile(request, env.DB, viewer.id);
  }

  if (pathname === DIRECTORY_ENDPOINT) {
    if (request.method !== "GET") return responseJson({ error: "method_not_allowed" }, 405);
    const rows = await env.DB.prepare(
      `${publicMemberSelect} ORDER BY m.display_name COLLATE NOCASE, m.id`,
    ).all<MemberDirectoryRow>();
    const followRows = await env.DB.prepare(`SELECT follower_member_id, followed_member_id FROM member_follows
      WHERE follower_member_id = ? OR followed_member_id = ?`).bind(viewer.id, viewer.id)
      .all<{ follower_member_id: number; followed_member_id: number }>();
    const viewerFollowing = new Set((followRows.results ?? []).filter((row) => row.follower_member_id === viewer.id).map((row) => row.followed_member_id));
    const viewerFollowers = new Set((followRows.results ?? []).filter((row) => row.followed_member_id === viewer.id).map((row) => row.follower_member_id));
    return responseJson({ members: (rows.results ?? []).map((row) => publicMemberFromRow(row, {
      isFollowing: viewerFollowing.has(row.id), followsViewer: viewerFollowers.has(row.id),
    })) });
  }

  if (followMatch || socialMatch) {
    const key = decodeURIComponent((followMatch ?? socialMatch)![1]);
    const target = await findPublicMember(env.DB, key);
    if (!target) return responseJson({ error: "メンバーが見つかりません" }, 404);
    if (followMatch) {
      if (viewer.id === target.id) return responseJson({ error: "自分自身はフォローできません" }, 400);
      const now = new Date().toISOString();
      if (request.method === "PUT") await env.DB.prepare(`INSERT OR IGNORE INTO member_follows
        (follower_member_id, followed_member_id, created_at) VALUES (?, ?, ?)`).bind(viewer.id, target.id, now).run();
      else if (request.method === "DELETE") await env.DB.prepare(`DELETE FROM member_follows
        WHERE follower_member_id = ? AND followed_member_id = ?`).bind(viewer.id, target.id).run();
      else return responseJson({ error: "method_not_allowed" }, 405);
      await env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, ?, 'member', ?, '{}', ?)`).bind(viewer.id, request.method === "PUT" ? "member.followed" : "member.unfollowed", String(target.id), now).run();
      const current = await findPublicMember(env.DB, key);
      return responseJson({ member: publicMemberFromRow(current!, await relationship(env.DB, viewer.id, target.id)) });
    }
    if (request.method !== "GET") return responseJson({ error: "method_not_allowed" }, 405);
    const direction = socialMatch![2];
    const socialRows = await env.DB.prepare(`${publicMemberSelect} AND m.id IN (
      SELECT ${direction === "followers" ? "follower_member_id" : "followed_member_id"} FROM member_follows
      WHERE ${direction === "followers" ? "followed_member_id" : "follower_member_id"} = ?)
      ORDER BY m.display_name COLLATE NOCASE`).bind(target.id).all<MemberDirectoryRow>();
    const members = [];
    for (const row of socialRows.results ?? []) members.push(publicMemberFromRow(row, await relationship(env.DB, viewer.id, row.id)));
    return responseJson({ members });
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
  return responseJson({ member: publicMemberFromRow(member, await relationship(env.DB, viewer.id, member.id)) });
}
