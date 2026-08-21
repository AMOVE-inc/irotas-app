import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const CLUBS_PATH = "/api/clubs";
const CLUB_PATH = /^\/api\/clubs\/([^/]+)$/;
const APPLICATION_PATH = /^\/api\/clubs\/([^/]+)\/applications$/;
const APPLICATION_REVIEW_PATH = /^\/api\/clubs\/([^/]+)\/applications\/([^/]+)$/;
const MEMBERSHIP_PATH = /^\/api\/clubs\/([^/]+)\/membership$/;
const MAX_BODY_BYTES = 16 * 1024;

type ClubRow = {
  id: string;
  name: string;
  description: string;
  icon: string;
  leader_member_id: number | null;
  leader_public_member_id: string | null;
  leader_display_name: string | null;
  status: "active" | "archived";
};

type MembershipRow = {
  club_id: string;
  member_id: number;
  public_member_id: string | null;
  status: "pending" | "on_hold" | "approved" | "rejected" | "left";
  wants_to_do: string;
  message_to_leader: string;
  applied_at: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function publicId(row: { member_id: number; public_member_id: string | null }) {
  return row.public_member_id ?? `member-${row.member_id}`;
}

function isElevated(member: NonNullable<Awaited<ReturnType<typeof authenticatedRequestMember>>>) {
  return member.role === "admin" || member.role === "operator" || member.access_role === "admin" || member.access_role === "operator";
}

async function readBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}

function requiredText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

async function viewerPublicId(db: D1Database, memberId: number) {
  const row = await db.prepare("SELECT public_member_id FROM members WHERE id = ?").bind(memberId).first<{ public_member_id: string | null }>();
  return row?.public_member_id ?? `member-${memberId}`;
}

async function clubRow(db: D1Database, id: string) {
  return db.prepare(`SELECT c.*, leader.public_member_id AS leader_public_member_id,
      leader.display_name AS leader_display_name
    FROM clubs c LEFT JOIN members leader ON leader.id = c.leader_member_id
    WHERE c.id = ? LIMIT 1`).bind(id).first<ClubRow>();
}

async function membershipsForClubs(db: D1Database, clubIds: string[]) {
  if (!clubIds.length) return [];
  const placeholders = clubIds.map(() => "?").join(",");
  const result = await db.prepare(`SELECT cm.club_id, cm.member_id, m.public_member_id, cm.status,
      cm.wants_to_do, cm.message_to_leader, cm.applied_at
    FROM club_memberships cm JOIN members m ON m.id = cm.member_id
    WHERE cm.club_id IN (${placeholders}) AND m.account_status = 'active'
    ORDER BY cm.applied_at`).bind(...clubIds).all<MembershipRow>();
  return result.results ?? [];
}

function serializeClub(row: ClubRow, memberships: MembershipRow[], viewerId: number, elevated: boolean) {
  const clubMemberships = memberships.filter((item) => item.club_id === row.id);
  const approved = clubMemberships.filter((item) => item.status === "approved");
  const pending = clubMemberships.filter((item) => item.status === "pending" || item.status === "on_hold");
  const canReview = elevated || row.leader_member_id === viewerId;
  const viewerMembership = clubMemberships.find((item) => item.member_id === viewerId);
  const visiblePending = pending.filter((item) => canReview || item.member_id === viewerId);
  const viewerMemberPublicId = viewerMembership ? publicId(viewerMembership) : null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    leaderId: row.leader_public_member_id ?? "",
    leaderName: row.leader_display_name ?? "未設定",
    memberIds: approved.map(publicId),
    applicantIds: visiblePending.filter((item) => item.status === "pending").map(publicId),
    applications: visiblePending
      .map((item) => ({
        memberId: publicId(item),
        wantsToDo: item.wants_to_do,
        messageToLeader: item.message_to_leader,
        status: item.status,
        appliedAt: item.applied_at,
      })),
    createdByAdmin: true,
    events: [],
    status: row.status,
    canReviewApplications: canReview,
    viewerMembershipStatus: viewerMembership?.status ?? null,
    viewerIsLeader: row.leader_member_id === viewerId,
    viewerMemberId: viewerMemberPublicId,
  };
}

async function audit(db: D1Database, actorId: number, action: string, clubId: string, metadata: Record<string, unknown> = {}) {
  await db.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
    VALUES (?, ?, 'club', ?, ?, ?)`).bind(String(actorId), action, clubId, JSON.stringify(metadata), new Date().toISOString()).run();
}

async function memberDisplayName(db: D1Database, memberId: number) {
  const row = await db.prepare("SELECT display_name FROM members WHERE id = ? LIMIT 1")
    .bind(memberId).first<{ display_name: string }>();
  return row?.display_name?.trim() || "メンバー";
}

async function notifyClubMember(
  db: D1Database,
  targetMemberId: number | null,
  type: "club_application" | "club_approval",
  title: string,
  body: string,
  clubId: string,
) {
  if (!targetMemberId) return;
  await db.prepare(`INSERT INTO in_app_notifications
    (id, target_member_id, type, title, body, club_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), targetMemberId, type, title, body, clubId, new Date().toISOString()).run();
}

async function memberIdFromPublicId(db: D1Database, value: string) {
  const fallback = /^member-(\d+)$/.exec(value);
  if (fallback) return Number(fallback[1]);
  const row = await db.prepare("SELECT id FROM members WHERE public_member_id = ? LIMIT 1").bind(value).first<{ id: number }>();
  return row?.id ?? null;
}

export async function canMemberAccessClub(db: D1Database, clubId: string, memberId: number, elevated = false) {
  if (elevated) return true;
  const row = await db.prepare(`SELECT 1 AS allowed FROM clubs c
    LEFT JOIN club_memberships cm ON cm.club_id = c.id AND cm.member_id = ? AND cm.status = 'approved'
    WHERE c.id = ? AND (c.leader_member_id = ? OR cm.member_id IS NOT NULL) LIMIT 1`)
    .bind(memberId, clubId, memberId).first<{ allowed: number }>();
  return Boolean(row);
}

export async function handleClubRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const clubMatch = CLUB_PATH.exec(pathname);
  const applicationMatch = APPLICATION_PATH.exec(pathname);
  const reviewMatch = APPLICATION_REVIEW_PATH.exec(pathname);
  const membershipMatch = MEMBERSHIP_PATH.exec(pathname);
  if (pathname !== CLUBS_PATH && !clubMatch && !applicationMatch && !reviewMatch && !membershipMatch) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);
  const elevated = isElevated(member);

  if (pathname === CLUBS_PATH && request.method === "GET") {
    const rows = await env.DB.prepare(`SELECT c.*, leader.public_member_id AS leader_public_member_id,
        leader.display_name AS leader_display_name
      FROM clubs c LEFT JOIN members leader ON leader.id = c.leader_member_id
      WHERE c.status = 'active' ORDER BY c.created_at, c.name`).all<ClubRow>();
    const clubs = rows.results ?? [];
    const memberships = await membershipsForClubs(env.DB, clubs.map((item) => item.id));
    return json({ clubs: clubs.map((item) => serializeClub(item, memberships, member.id, elevated)) });
  }

  if (clubMatch && request.method === "GET") {
    const row = await clubRow(env.DB, decodeURIComponent(clubMatch[1]));
    if (!row || row.status !== "active") return json({ error: "部活が見つかりません" }, 404);
    const memberships = await membershipsForClubs(env.DB, [row.id]);
    return json({ club: serializeClub(row, memberships, member.id, elevated) });
  }

  if (applicationMatch && request.method === "POST") {
    const id = decodeURIComponent(applicationMatch[1]);
    const row = await clubRow(env.DB, id);
    if (!row || row.status !== "active") return json({ error: "部活が見つかりません" }, 404);
    if (row.leader_member_id === member.id) return json({ error: "部長はすでに入部しています" }, 409);
    const input = await readBody(request);
    const wantsToDo = requiredText(input?.wantsToDo, 2000);
    const messageToLeader = requiredText(input?.messageToLeader, 2000);
    if (!wantsToDo || !messageToLeader) return json({ error: "やってみたいことと部長へのメッセージは必須です" }, 400);
    const current = await env.DB.prepare("SELECT status FROM club_memberships WHERE club_id = ? AND member_id = ?")
      .bind(id, member.id).first<{ status: string }>();
    if (current?.status === "approved") return json({ error: "すでに入部しています" }, 409);
    if (current?.status === "pending" || current?.status === "on_hold") return json({ error: "すでに申請中です" }, 409);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO club_memberships
      (club_id, member_id, status, wants_to_do, message_to_leader, source, applied_at, updated_at)
      VALUES (?, ?, 'pending', ?, ?, 'app', ?, ?)
      ON CONFLICT(club_id, member_id) DO UPDATE SET status = 'pending', wants_to_do = excluded.wants_to_do,
        message_to_leader = excluded.message_to_leader, source = 'app', applied_at = excluded.applied_at,
        approved_at = NULL, decided_at = NULL, decided_by_member_id = NULL, updated_at = excluded.updated_at`)
      .bind(id, member.id, wantsToDo, messageToLeader, now, now).run();
    await audit(env.DB, member.id, "club.application_submitted", id);
    const applicantName = await memberDisplayName(env.DB, member.id);
    await notifyClubMember(
      env.DB,
      row.leader_member_id,
      "club_application",
      `${row.name}に入部申請が届きました`,
      `${applicantName}さんから入部申請が届いています。申請内容と参加履歴を確認してください。`,
      id,
    );
    const memberships = await membershipsForClubs(env.DB, [id]);
    return json({ club: serializeClub(row, memberships, member.id, elevated) }, 201);
  }

  if (reviewMatch && request.method === "PATCH") {
    const id = decodeURIComponent(reviewMatch[1]);
    const targetPublicId = decodeURIComponent(reviewMatch[2]);
    const row = await clubRow(env.DB, id);
    if (!row) return json({ error: "部活が見つかりません" }, 404);
    if (!(elevated || row.leader_member_id === member.id)) return json({ error: "この部活の部長または運営のみ承認できます" }, 403);
    const targetId = await memberIdFromPublicId(env.DB, targetPublicId);
    const input = await readBody(request);
    const action = input?.action;
    if (!targetId || !["approve", "hold", "reject"].includes(String(action))) return json({ error: "入力内容を確認してください" }, 400);
    const current = await env.DB.prepare("SELECT status FROM club_memberships WHERE club_id = ? AND member_id = ?")
      .bind(id, targetId).first<{ status: string }>();
    if (!current || !["pending", "on_hold"].includes(current.status)) return json({ error: "審査対象の申請が見つかりません" }, 404);
    const nextStatus = action === "approve" ? "approved" : action === "hold" ? "on_hold" : "rejected";
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE club_memberships SET status = ?, approved_at = ?, decided_at = ?,
      decided_by_member_id = ?, updated_at = ? WHERE club_id = ? AND member_id = ?`)
      .bind(nextStatus, nextStatus === "approved" ? now : null, now, member.id, now, id, targetId).run();
    await audit(env.DB, member.id, `club.application_${nextStatus}`, id, { targetMemberId: targetId });
    if (nextStatus === "approved") {
      const leaderName = await memberDisplayName(env.DB, member.id);
      await notifyClubMember(
        env.DB,
        targetId,
        "club_approval",
        `${row.name}への入部が承認されました`,
        `${leaderName}さんが入部申請を承認しました。部員限定スレッドを閲覧できます。まずは${row.name}の自己紹介スレッドへ投稿しましょう。`,
        id,
      );
    }
    const memberships = await membershipsForClubs(env.DB, [id]);
    return json({ club: serializeClub(row, memberships, member.id, elevated) });
  }

  if (reviewMatch && request.method === "GET") {
    const id = decodeURIComponent(reviewMatch[1]);
    const targetPublicId = decodeURIComponent(reviewMatch[2]);
    const row = await clubRow(env.DB, id);
    if (!row) return json({ error: "部活が見つかりません" }, 404);
    if (!(elevated || row.leader_member_id === member.id)) return json({ error: "申請者情報を確認できるのは、この部活の部長または運営のみです" }, 403);
    const targetId = await memberIdFromPublicId(env.DB, targetPublicId);
    if (!targetId) return json({ error: "メンバーが見つかりません" }, 404);
    const application = await env.DB.prepare(`SELECT status, wants_to_do, message_to_leader, applied_at
      FROM club_memberships WHERE club_id = ? AND member_id = ? AND status IN ('pending', 'on_hold')`)
      .bind(id, targetId).first<{ status: string; wants_to_do: string; message_to_leader: string; applied_at: string }>();
    if (!application) return json({ error: "審査対象の申請が見つかりません" }, 404);
    const applicant = await env.DB.prepare(`SELECT m.public_member_id, m.display_name, m.member_term, m.member_rank,
        m.branches_json, m.profile_json, m.participation_count, m.organizer_count,
        COALESCE(s.subscription_started_at, m.discord_joined_at, m.created_at) AS joined_at
      FROM members m LEFT JOIN member_subscriptions s ON s.member_id = m.id
      WHERE m.id = ? AND m.account_status = 'active' LIMIT 1`).bind(targetId).first<{
        public_member_id: string | null; display_name: string; member_term: string | null; member_rank: string;
        branches_json: string; profile_json: string; participation_count: number; organizer_count: number; joined_at: string;
      }>();
    if (!applicant) return json({ error: "メンバーが見つかりません" }, 404);
    const history = await env.DB.prepare(`SELECT e.id, e.title, e.event_date AS date, e.event_type AS eventType
      FROM event_participations p JOIN events e ON e.id = p.event_id
      WHERE p.member_id = ? AND p.status = 'confirmed' AND e.status != 'cancelled'
      ORDER BY e.event_date DESC LIMIT 5`).bind(targetId).all<{ id: string; title: string; date: string; eventType: string }>();
    let branches: string[] = [];
    let profile: Record<string, unknown> = {};
    try { branches = JSON.parse(applicant.branches_json) as string[]; } catch {}
    try { profile = JSON.parse(applicant.profile_json) as Record<string, unknown>; } catch {}
    return json({ review: {
      memberId: applicant.public_member_id ?? `member-${targetId}`,
      displayName: applicant.display_name,
      memberTerm: applicant.member_term,
      memberRank: applicant.member_rank,
      branches,
      profile,
      joinedAt: applicant.joined_at,
      participationCount: applicant.participation_count,
      organizerCount: applicant.organizer_count,
      wantsToDo: application.wants_to_do,
      messageToLeader: application.message_to_leader,
      status: application.status,
      appliedAt: application.applied_at,
      eventHistory: history.results ?? [],
    } });
  }

  if (membershipMatch && request.method === "DELETE") {
    const id = decodeURIComponent(membershipMatch[1]);
    const row = await clubRow(env.DB, id);
    if (!row) return json({ error: "部活が見つかりません" }, 404);
    if (row.leader_member_id === member.id) return json({ error: "部長は後任が設定されるまで退部できません" }, 409);
    const current = await env.DB.prepare("SELECT status FROM club_memberships WHERE club_id = ? AND member_id = ?")
      .bind(id, member.id).first<{ status: string }>();
    if (current?.status !== "approved") return json({ error: "入部中の部活ではありません" }, 409);
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE club_memberships SET status = 'left', decided_at = ?, decided_by_member_id = ?, updated_at = ?
      WHERE club_id = ? AND member_id = ?`).bind(now, member.id, now, id, member.id).run();
    await audit(env.DB, member.id, "club.membership_left", id);
    const memberships = await membershipsForClubs(env.DB, [id]);
    return json({ club: serializeClub(row, memberships, member.id, elevated) });
  }

  return json({ error: "method_not_allowed" }, 405);
}
