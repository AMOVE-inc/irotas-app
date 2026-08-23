import type { D1Database } from "./platform-types";
import { rankFromXp } from "./xp";

const HOST_REWARD = 20;

type MemberRow = {
  xp: number | null;
  role: string;
  access_role: string | null;
};

function isOperator(member: MemberRow) {
  return [member.role, member.access_role].some((role) => role === "operator" || role === "admin");
}

export async function awardCompletedEventHostXp(db: D1Database, eventId: string, organizerMemberId: number, now: string) {
  const member = await db.prepare("SELECT xp, role, access_role FROM members WHERE id = ?")
    .bind(organizerMemberId).first<MemberRow>();
  if (!member || isOperator(member)) return false;
  const existing = await db.prepare("SELECT status FROM event_host_xp_operations WHERE event_id = ?")
    .bind(eventId).first<{ status: string }>();
  if (existing) return false;
  const previousXp = Math.max(0, Number(member.xp ?? 0));
  const nextXp = previousXp + HOST_REWARD;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO event_host_xp_operations
      (event_id, member_id, amount, status, xp_before, created_at)
      VALUES (?, ?, ?, 'pending', ?, ?)`).bind(eventId, organizerMemberId, HOST_REWARD, previousXp, now),
    db.prepare(`UPDATE members SET xp = COALESCE(xp, 0) + ?, member_rank = ?, updated_at = ?
      WHERE id = ? AND EXISTS (SELECT 1 FROM event_host_xp_operations WHERE event_id = ? AND status = 'pending')`)
      .bind(HOST_REWARD, rankFromXp(nextXp), now, organizerMemberId, eventId),
    db.prepare(`UPDATE event_host_xp_operations SET status = 'applied', xp_after = xp_before + amount, applied_at = ?
      WHERE event_id = ? AND status = 'pending'`).bind(now, eventId),
  ]);
  return true;
}

export async function reverseCancelledEventHostXp(db: D1Database, eventId: string, now: string) {
  const operation = await db.prepare(`SELECT member_id, amount FROM event_host_xp_operations
    WHERE event_id = ? AND status = 'applied'`).bind(eventId).first<{ member_id: number; amount: number }>();
  if (!operation) return false;
  const member = await db.prepare("SELECT xp, role, access_role FROM members WHERE id = ?")
    .bind(operation.member_id).first<MemberRow>();
  if (!member) return false;
  const nextXp = Math.max(0, Number(member.xp ?? 0) - Number(operation.amount));
  await db.batch([
    db.prepare("UPDATE members SET xp = ?, member_rank = ?, updated_at = ? WHERE id = ?")
      .bind(nextXp, rankFromXp(nextXp), now, operation.member_id),
    db.prepare("UPDATE event_host_xp_operations SET status = 'reversed', reversed_at = ? WHERE event_id = ? AND status = 'applied'")
      .bind(now, eventId),
  ]);
  return true;
}
