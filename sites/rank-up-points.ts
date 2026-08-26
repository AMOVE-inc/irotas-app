import type { D1Database } from "./platform-types";

export const RANK_UP_POINT_BONUSES = {
  silver: 500,
  gold: 1000,
  platinum: 2000,
} as const;

type RewardRank = keyof typeof RANK_UP_POINT_BONUSES;

const RANK_ORDER: Record<string, number> = {
  regular: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
};

function isRewardRank(rank: string): rank is RewardRank {
  return Object.prototype.hasOwnProperty.call(RANK_UP_POINT_BONUSES, rank);
}

export function rankUpPointBonus(previousRank: string, nextRank: string) {
  if (!isRewardRank(nextRank) || (RANK_ORDER[nextRank] ?? -1) <= (RANK_ORDER[previousRank] ?? -1)) return 0;
  return RANK_UP_POINT_BONUSES[nextRank];
}

function rankLabel(rank: RewardRank) {
  return ({ silver: "シルバー", gold: "ゴールド", platinum: "プラチナ" } as const)[rank];
}

export function rankUpPointAwardStatements(
  db: D1Database,
  input: { memberId: number; previousRank: string; nextRank: string; now: string },
) {
  const amount = rankUpPointBonus(input.previousRank, input.nextRank);
  if (!amount || !isRewardRank(input.nextRank)) return [];

  const idempotencyKey = `rank-up:${input.memberId}:${input.nextRank}`;
  const transactionId = crypto.randomUUID();
  const reason = `${rankLabel(input.nextRank)}ランクアップ特典`;

  return [
    db.prepare(`INSERT OR IGNORE INTO irotas_point_balances (member_id, balance, updated_at)
      VALUES (?, 0, ?)`)
      .bind(input.memberId, input.now),
    db.prepare(`INSERT OR IGNORE INTO irotas_point_operation_requests
      (idempotency_key, member_id, actor_member_id, amount, reason, balance_before, transaction_id, created_at)
      SELECT ?, ?, NULL, ?, ?, balance, ?, ?
      FROM irotas_point_balances WHERE member_id = ?`)
      .bind(idempotencyKey, input.memberId, amount, reason, transactionId, input.now, input.memberId),
    db.prepare(`UPDATE irotas_point_balances SET balance = balance + ?, updated_at = ?
      WHERE member_id = ? AND EXISTS (
        SELECT 1 FROM irotas_point_operation_requests WHERE idempotency_key = ? AND status = 'pending'
      )`)
      .bind(amount, input.now, input.memberId, idempotencyKey),
    db.prepare(`UPDATE irotas_point_operation_requests
      SET status = 'applied', balance_after = balance_before + amount, completed_at = ?
      WHERE idempotency_key = ? AND status = 'pending'`)
      .bind(input.now, idempotencyKey),
    db.prepare(`INSERT OR IGNORE INTO irotas_point_transactions
      (id, member_id, actor_member_id, amount, balance_after, reason, idempotency_key, created_at)
      SELECT transaction_id, member_id, actor_member_id, amount, balance_after, reason, idempotency_key, ?
      FROM irotas_point_operation_requests
      WHERE idempotency_key = ? AND status = 'applied'`)
      .bind(input.now, idempotencyKey),
  ];
}

export async function readNewRankUpPointAward(
  db: D1Database,
  input: { memberId: number; previousRank: string; nextRank: string; now: string },
) {
  const amount = rankUpPointBonus(input.previousRank, input.nextRank);
  if (!amount || !isRewardRank(input.nextRank)) return null;
  const operation = await db.prepare(`SELECT amount, balance_after, created_at FROM irotas_point_operation_requests
    WHERE idempotency_key = ? AND member_id = ? AND status = 'applied'`)
    .bind(`rank-up:${input.memberId}:${input.nextRank}`, input.memberId)
    .first<{ amount: number; balance_after: number; created_at: string }>();
  if (!operation || operation.created_at !== input.now) return null;
  return { rank: input.nextRank, amount: Number(operation.amount), balance: Number(operation.balance_after) };
}
