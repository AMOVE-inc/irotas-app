import type { D1Database } from "./platform-types";
import { rankFromXp } from "./xp";

export const EVENT_XP = {
  created: 0,
  completedHost: 100,
  attendanceBonus4: 0,
  attendanceBonus8: 0,
  attendance: 40,
  feedback: 0,
} as const;

type EventRewardAction = "event_created" | "event_completed_host" | "event_attendance_bonus" | "event_attendance" | "event_feedback";

type MemberRow = { xp: number | null; role: string | null; access_role: string | null };
function excluded(row: MemberRow | null) { return !row || [row.role, row.access_role].some((value) => value === "admin" || value === "operator"); }

async function applyMemberXp(db: D1Database, memberId: number, amount: number, now: string) {
  const member = await db.prepare("SELECT xp, role, access_role FROM members WHERE id = ?").bind(memberId).first<MemberRow>();
  if (excluded(member)) return false;
  const nextXp = Math.max(0, Number(member!.xp ?? 0) + amount);
  await db.prepare("UPDATE members SET xp = ?, member_rank = ?, updated_at = ? WHERE id = ?")
    .bind(nextXp, rankFromXp(nextXp), now, memberId).run();
  return true;
}

export async function awardEventReward(db: D1Database, input: { memberId: number; eventId: string; action: EventRewardAction; amount: number; now: string }) {
  const id = `event-xp:${input.eventId}:${input.memberId}:${input.action}`;
  const existing = await db.prepare("SELECT status FROM event_xp_rewards WHERE member_id = ? AND event_id = ? AND action = ?")
    .bind(input.memberId, input.eventId, input.action).first<{ status: string }>();
  if (existing?.status === "applied") return false;
  const member = await db.prepare("SELECT xp, role, access_role FROM members WHERE id = ?").bind(input.memberId).first<MemberRow>();
  if (excluded(member)) return false;
  const nextXp = Math.max(0, Number(member!.xp ?? 0) + input.amount);
  if (existing?.status === "reversed") {
    await db.batch([
      db.prepare("UPDATE event_xp_rewards SET amount = ?, status = 'applied', created_at = ?, reversed_at = NULL WHERE member_id = ? AND event_id = ? AND action = ?")
        .bind(input.amount, input.now, input.memberId, input.eventId, input.action),
      db.prepare("UPDATE members SET xp = ?, member_rank = ?, updated_at = ? WHERE id = ?")
        .bind(nextXp, rankFromXp(nextXp), input.now, input.memberId),
    ]);
    return true;
  }
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO event_xp_rewards (id, member_id, event_id, action, amount, status, created_at) VALUES (?, ?, ?, ?, ?, 'applied', ?)")
      .bind(id, input.memberId, input.eventId, input.action, input.amount, input.now),
    db.prepare("UPDATE members SET xp = ?, member_rank = ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM event_xp_rewards WHERE id = ? AND status = 'applied')")
      .bind(nextXp, rankFromXp(nextXp), input.now, input.memberId, id),
  ]);
  return true;
}

export async function reverseEventRewards(db: D1Database, eventId: string, now: string, actions?: EventRewardAction[]) {
  const clauses = actions?.length ? ` AND action IN (${actions.map(() => "?").join(",")})` : "";
  const rewards = await db.prepare(`SELECT id, member_id, amount FROM event_xp_rewards WHERE event_id = ? AND status = 'applied'${clauses}`)
    .bind(eventId, ...(actions ?? [])).all<{ id: string; member_id: number; amount: number }>();
  for (const reward of rewards.results ?? []) {
    await applyMemberXp(db, reward.member_id, -Math.max(0, Number(reward.amount)), now);
    await db.prepare("UPDATE event_xp_rewards SET status = 'reversed', reversed_at = ? WHERE id = ? AND status = 'applied'")
      .bind(now, reward.id).run();
  }
  return rewards.results?.length ?? 0;
}

export async function awardHelpfulAnswer(db: D1Database, input: { threadId: string; commentId: string; memberId: number; now: string }) {
  const id = `board-xp:${input.commentId}:helpful_answer`;
  const existing = await db.prepare("SELECT status FROM board_xp_rewards WHERE comment_id = ? AND action = 'helpful_answer'")
    .bind(input.commentId).first<{ status: string }>();
  if (existing) return false;
  const member = await db.prepare("SELECT xp, role, access_role FROM members WHERE id = ?").bind(input.memberId).first<MemberRow>();
  if (excluded(member)) return false;
  const nextXp = Math.max(0, Number(member!.xp ?? 0) + 5);
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO board_xp_rewards (id, member_id, thread_id, comment_id, action, amount, status, created_at) VALUES (?, ?, ?, ?, 'helpful_answer', 5, 'applied', ?)")
      .bind(id, input.memberId, input.threadId, input.commentId, input.now),
    db.prepare("UPDATE members SET xp = ?, member_rank = ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM board_xp_rewards WHERE id = ? AND status = 'applied')")
      .bind(nextXp, rankFromXp(nextXp), input.now, input.memberId, id),
  ]);
  return true;
}

export async function reverseHelpfulAnswer(db: D1Database, commentId: string, now: string) {
  const reward = await db.prepare("SELECT id, member_id, amount FROM board_xp_rewards WHERE comment_id = ? AND action = 'helpful_answer' AND status = 'applied'")
    .bind(commentId).first<{ id: string; member_id: number; amount: number }>();
  if (!reward) return false;
  await applyMemberXp(db, reward.member_id, -Number(reward.amount), now);
  await db.prepare("UPDATE board_xp_rewards SET status = 'reversed', reversed_at = ? WHERE id = ?")
    .bind(now, reward.id).run();
  return true;
}
