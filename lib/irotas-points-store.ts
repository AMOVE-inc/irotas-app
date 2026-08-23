/**
 * イロタスポイントストア
 * - 会員ランクポイントとは別の独立したポイント制度
 * - ランクアップ時に付与、管理者からも付与可能
 * - イベント参加費の割引に利用可能（1pt = 1円）
 * - AsyncStorageで永続化
 * - 書き込みはシリアライズして競合・二重消費を防ぐ
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { adjustSharedIrotasPoints, getSharedBenefits } from "./benefits-api";

const IROTAS_POINTS_KEY = "irotas_points_balances";
const IROTAS_POINTS_HISTORY_KEY = "irotas_points_history";
const FEE_EXEMPTION_KEY = "fee_exemption_members";

export type IrotasPointsHistory = {
  id: string;
  memberId: string;
  memberName: string;
  amount: number; // 正: 付与, 負: 使用
  reason: string;
  at: string;
};

// ランクアップ時の付与ポイント
export const RANK_UP_BONUS: Record<string, number> = {
  silver: 100,
  gold: 300,
  platinum: 500,
};

// インメモリキャッシュ
let balancesCache: Record<string, number> | null = null;
let historyCache: IrotasPointsHistory[] | null = null;
let feeExemptionCache: Set<string> | null = null;

// 書き込み競合・二重消費を防ぐためのPromiseチェーン
let pointsWriteChain: Promise<void> = Promise.resolve();

/** 書き込みをシリアライズして競合を防ぐ */
function enqueuePointsWrite(fn: () => Promise<void>): Promise<void> {
  pointsWriteChain = pointsWriteChain.then(fn).catch(() => {});
  return pointsWriteChain;
}

/** イロタスポイント残高を全件取得 */
export async function getIrotasPointsBalances(): Promise<Record<string, number>> {
  if (balancesCache) return balancesCache;
  try {
    const shared = await getSharedBenefits();
    balancesCache = { ...shared.points.balances, current: shared.points.balance };
    return balancesCache;
  } catch {}
  try {
    const raw = await AsyncStorage.getItem(IROTAS_POINTS_KEY);
    balancesCache = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return balancesCache!;
  } catch {
    return {};
  }
}

/** 特定メンバーのイロタスポイント残高を取得 */
export async function getIrotasPoints(memberId: string): Promise<number> {
  const balances = await getIrotasPointsBalances();
  return balances[memberId] ?? balances.current ?? 0;
}

/** イロタスポイントを付与・消費する（シリアライズ済み） */
export async function adjustIrotasPoints(
  memberId: string,
  memberName: string,
  amount: number,
  reason: string,
  idempotencyKey = `client:${memberId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
): Promise<number> {
  let resultBalance = 0;

  await enqueuePointsWrite(async () => {
    const shared = await adjustSharedIrotasPoints({ amount, reason, idempotencyKey, ...(amount > 0 ? { memberId } : {}) });
    resultBalance = shared.balance;
    balancesCache = { ...(balancesCache ?? {}), [memberId]: shared.balance, current: shared.balance };
    historyCache = null;
    return;
    // キャッシュを無効化して最新データを取得（競合防止）
    balancesCache = null;
    const balances = await getIrotasPointsBalances();
    const current = balances[memberId] ?? 0;
    const newBalance = Math.max(0, current + amount);
    balances[memberId] = newBalance;
    balancesCache = balances;
    await AsyncStorage.setItem(IROTAS_POINTS_KEY, JSON.stringify(balances));

    // 履歴に追加
    historyCache = null;
    const history = await getIrotasPointsHistory();
    const entry: IrotasPointsHistory = {
      id: `ipt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      memberId,
      memberName,
      amount,
      reason,
      at: new Date().toLocaleString("ja-JP"),
    };
    const updated = [entry, ...history].slice(0, 200);
    historyCache = updated;
    await AsyncStorage.setItem(IROTAS_POINTS_HISTORY_KEY, JSON.stringify(updated));

    resultBalance = newBalance;
  });

  return resultBalance;
}

/** イロタスポイント変更履歴を取得 */
export async function getIrotasPointsHistory(): Promise<IrotasPointsHistory[]> {
  if (historyCache) return historyCache;
  try {
    const shared = await getSharedBenefits();
    historyCache = shared.points.history.map((entry) => ({
      id: String(entry.id),
      memberId: String(entry.public_member_id ?? `member-${entry.member_id}`),
      memberName: String(entry.display_name ?? "会員"),
      amount: Number(entry.amount),
      reason: String(entry.reason),
      at: String(entry.created_at),
    }));
    return historyCache;
  } catch {}
  try {
    const raw = await AsyncStorage.getItem(IROTAS_POINTS_HISTORY_KEY);
    historyCache = raw ? (JSON.parse(raw) as IrotasPointsHistory[]) : [];
    return historyCache!;
  } catch {
    return [];
  }
}

/** 会費免除メンバーのIDセットを取得 */
export async function getFeeExemptionMembers(): Promise<Set<string>> {
  if (feeExemptionCache) return feeExemptionCache;
  try {
    const raw = await AsyncStorage.getItem(FEE_EXEMPTION_KEY);
    feeExemptionCache = raw ? new Set(JSON.parse(raw) as string[]) : new Set<string>();
    return feeExemptionCache!;
  } catch {
    return new Set<string>();
  }
}

/** 特定メンバーの会費免除状態を確認 */
export async function isFeeExempt(memberId: string): Promise<boolean> {
  const exempt = await getFeeExemptionMembers();
  return exempt.has(memberId);
}

/** 会費免除を設定・解除する */
export async function setFeeExemption(memberId: string, exempt: boolean): Promise<void> {
  const current = await getFeeExemptionMembers();
  if (exempt) {
    current.add(memberId);
  } else {
    current.delete(memberId);
  }
  feeExemptionCache = current;
  await AsyncStorage.setItem(FEE_EXEMPTION_KEY, JSON.stringify([...current]));
}

/** キャッシュをクリア（テスト用・再読み込み用） */
export function clearIrotasPointsCache(): void {
  balancesCache = null;
  historyCache = null;
  feeExemptionCache = null;
}
