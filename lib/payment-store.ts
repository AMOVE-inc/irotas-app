import AsyncStorage from "@react-native-async-storage/async-storage";

export type PaymentStatus = "unpaid" | "paid" | "exempted";

export interface PaymentRecord {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  userRank: string;
  amount: number; // 円
  status: PaymentStatus;
  paidAt?: string; // ISO date string
  createdAt: string;
}

const STORAGE_KEY = "irotas_payment_records";

let cache: PaymentRecord[] | null = null;
// 書き込み競合を防ぐためのPromiseチェーン
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<PaymentRecord[]> {
  if (cache !== null) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as PaymentRecord[]) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

/** 書き込みをシリアライズして競合を防ぐ */
function enqueueWrite(fn: () => Promise<void>): Promise<void> {
  writeChain = writeChain.then(fn).catch(() => {
    // チェーンが壊れないよう個別エラーは握りつぶす（呼び出し元でハンドル）
  });
  return writeChain;
}

async function save(records: PaymentRecord[]): Promise<void> {
  cache = records;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/** イベント参加時に支払いレコードを作成（既存の場合はスキップ） */
export async function createPaymentRecord(params: {
  eventId: string;
  userId: string;
  userName: string;
  userRank: string;
  amount: number;
}): Promise<void> {
  return enqueueWrite(async () => {
    // キャッシュを無効化して最新データを取得（競合防止）
    cache = null;
    const records = await load();
    const exists = records.find(
      (r) => r.eventId === params.eventId && r.userId === params.userId,
    );
    if (exists) return;
    const newRecord: PaymentRecord = {
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      eventId: params.eventId,
      userId: params.userId,
      userName: params.userName,
      userRank: params.userRank,
      amount: params.amount,
      status: "unpaid",
      createdAt: new Date().toISOString(),
    };
    records.push(newRecord);
    await save(records);
  });
}

/** イベントの支払いレコード一覧を取得 */
export async function getPaymentsByEvent(eventId: string): Promise<PaymentRecord[]> {
  const records = await load();
  return records.filter((r) => r.eventId === eventId);
}

/** 支払い状況を更新 */
export async function updatePaymentStatus(
  recordId: string,
  status: PaymentStatus,
): Promise<void> {
  return enqueueWrite(async () => {
    const records = await load();
    const idx = records.findIndex((r) => r.id === recordId);
    if (idx === -1) return;
    records[idx].status = status;
    if (status === "paid") {
      records[idx].paidAt = new Date().toISOString();
    } else {
      delete records[idx].paidAt;
    }
    await save(records);
  });
}

/** 全イベントの支払いレコードを取得（管理者用） */
export async function getAllPayments(): Promise<PaymentRecord[]> {
  return load();
}

/** キャッシュをクリアして再読み込みを強制 */
export function clearPaymentCache(): void {
  cache = null;
}
