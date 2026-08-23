import type { D1Database } from "./platform-types";

type UsageRow = { amount: number; version: number; status: "applied" | "refunded" };

export type EventPointResult = { success: boolean; balance: number; amount: number; duplicate?: boolean };

export async function applyEventPointDiscount(
  db: D1Database,
  eventId: string,
  memberId: number,
  amount: number,
  eventTitle: string,
  now: string,
): Promise<EventPointResult> {
  if (!Number.isInteger(amount) || amount <= 0) return { success: false, balance: 0, amount: 0 };
  const usage = await db.prepare("SELECT amount, version, status FROM event_point_usages WHERE event_id = ? AND member_id = ?")
    .bind(eventId, memberId).first<UsageRow>();
  const current = await db.prepare("SELECT balance FROM irotas_point_balances WHERE member_id = ?")
    .bind(memberId).first<{ balance: number }>();
  const balance = Number(current?.balance ?? 0);
  if (usage?.status === "applied") return { success: true, balance, amount: usage.amount, duplicate: true };
  if (balance < amount) return { success: false, balance, amount: 0 };
  const version = (usage?.version ?? 0) + 1;
  const key = `event-discount:${eventId}:${memberId}:${version}`;
  const transactionId = crypto.randomUUID();
  const reason = `イベント「${eventTitle}」参加費割引`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO irotas_point_operation_requests
      (idempotency_key, member_id, actor_member_id, amount, reason, balance_before, transaction_id, created_at)
      SELECT ?, ?, ?, ?, ?, balance, ?, ? FROM irotas_point_balances WHERE member_id = ?`)
      .bind(key, memberId, memberId, -amount, reason, transactionId, now, memberId),
    db.prepare(`UPDATE irotas_point_balances SET balance = balance - ?, updated_at = ?
      WHERE member_id = ? AND balance >= ? AND EXISTS (SELECT 1 FROM irotas_point_operation_requests WHERE idempotency_key = ? AND status = 'pending')`)
      .bind(amount, now, memberId, amount, key),
    db.prepare(`UPDATE irotas_point_operation_requests SET
      status = CASE WHEN balance_before >= ? THEN 'applied' ELSE 'rejected' END,
      balance_after = CASE WHEN balance_before >= ? THEN balance_before - ? ELSE balance_before END,
      completed_at = ? WHERE idempotency_key = ? AND status = 'pending'`)
      .bind(amount, amount, amount, now, key),
    db.prepare(`INSERT OR IGNORE INTO irotas_point_transactions
      (id, member_id, actor_member_id, amount, balance_after, reason, idempotency_key, created_at)
      SELECT transaction_id, member_id, actor_member_id, amount, balance_after, reason, idempotency_key, ?
      FROM irotas_point_operation_requests WHERE idempotency_key = ? AND status = 'applied'`).bind(now, key),
    db.prepare(`INSERT INTO event_point_usages
      (event_id, member_id, amount, version, status, applied_transaction_id, applied_at, refund_transaction_id, refunded_at)
      SELECT ?, ?, ?, ?, 'applied', transaction_id, ?, NULL, NULL FROM irotas_point_operation_requests
      WHERE idempotency_key = ? AND status = 'applied'
      ON CONFLICT(event_id, member_id) DO UPDATE SET amount = excluded.amount, version = excluded.version,
        status = 'applied', applied_transaction_id = excluded.applied_transaction_id, applied_at = excluded.applied_at,
        refund_transaction_id = NULL, refunded_at = NULL`)
      .bind(eventId, memberId, amount, version, now, key),
  ]);
  const operation = await db.prepare("SELECT status, balance_after FROM irotas_point_operation_requests WHERE idempotency_key = ?")
    .bind(key).first<{ status: string; balance_after: number }>();
  return operation?.status === "applied"
    ? { success: true, balance: Number(operation.balance_after), amount }
    : { success: false, balance, amount: 0 };
}

export async function refundEventPointDiscount(db: D1Database, eventId: string, memberId: number, eventTitle: string, now: string) {
  const usage = await db.prepare(`SELECT amount, version, status FROM event_point_usages
    WHERE event_id = ? AND member_id = ?`).bind(eventId, memberId).first<UsageRow>();
  if (!usage || usage.status !== "applied") return false;
  const key = `event-discount-refund:${eventId}:${memberId}:${usage.version}`;
  const transactionId = crypto.randomUUID();
  const reason = `イベント「${eventTitle}」中止・キャンセルによるポイント返還`;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO irotas_point_balances (member_id, balance, updated_at) VALUES (?, 0, ?)").bind(memberId, now),
    db.prepare(`INSERT OR IGNORE INTO irotas_point_operation_requests
      (idempotency_key, member_id, actor_member_id, amount, reason, balance_before, transaction_id, created_at)
      SELECT ?, ?, ?, ?, ?, balance, ?, ? FROM irotas_point_balances WHERE member_id = ?`)
      .bind(key, memberId, memberId, usage.amount, reason, transactionId, now, memberId),
    db.prepare(`UPDATE irotas_point_balances SET balance = balance + ?, updated_at = ?
      WHERE member_id = ? AND EXISTS (SELECT 1 FROM irotas_point_operation_requests WHERE idempotency_key = ? AND status = 'pending')`)
      .bind(usage.amount, now, memberId, key),
    db.prepare(`UPDATE irotas_point_operation_requests SET status = 'applied', balance_after = balance_before + amount,
      completed_at = ? WHERE idempotency_key = ? AND status = 'pending'`).bind(now, key),
    db.prepare(`INSERT OR IGNORE INTO irotas_point_transactions
      (id, member_id, actor_member_id, amount, balance_after, reason, idempotency_key, created_at)
      SELECT transaction_id, member_id, actor_member_id, amount, balance_after, reason, idempotency_key, ?
      FROM irotas_point_operation_requests WHERE idempotency_key = ? AND status = 'applied'`).bind(now, key),
    db.prepare(`UPDATE event_point_usages SET status = 'refunded',
      refund_transaction_id = (SELECT transaction_id FROM irotas_point_operation_requests
        WHERE idempotency_key = ? AND status = 'applied'), refunded_at = ?
      WHERE event_id = ? AND member_id = ? AND version = ? AND status = 'applied'
        AND EXISTS (SELECT 1 FROM irotas_point_operation_requests WHERE idempotency_key = ? AND status = 'applied')`)
      .bind(key, now, eventId, memberId, usage.version, key),
  ]);
  return true;
}
