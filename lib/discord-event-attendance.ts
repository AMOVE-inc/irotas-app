import type { Event } from "../constants/mock-data";

// Discordで確定した人数を、移行元のイベントIDに紐づけて保持する。
// アプリの参加者配列には幹事・同席者などが含まれ、Discord側の確定人数と一致しない。
const importedConfirmedCounts: Record<string, number> = {
  "discord-event-1544896603603738664": 7, // 10/2 野毛みかん
  "discord-event-1545430214082039808": 3, // 10/4 日本酒イベント
  "discord-event-1543599911507861514": 0, // 10/9 さわいし
  "discord-event-1546174424619946014": 8, // 10/15 韓国料理
  "discord-event-1547564106469613568": 3, // 10/17 うしの絵
  "discord-event-1542148647565660321": 3, // 10/20 前芝料理店
  "discord-event-1545794805269798983": 3, // 10/24 炭火焼ゆうじ
  "discord-event-1545132446675107870": 6, // 9/22 RistoPizza
  "discord-event-1537390278665568327": 9, // 9/22 赤坂迎賓館ナイトウォーク
};

// Discord側の確定人数と募集枠を表示する場合、過去イベントの実際の予約定員とは異なることがある。
const importedDisplayCapacities: Record<string, number> = {
  "discord-event-1537390278665568327": 3, // 9/22 赤坂迎賓館ナイトウォーク
};

export function discordEventConfirmedCount(event: Event): number | null {
  const imported = importedConfirmedCounts[event.id];
  return imported === undefined ? null : imported;
}

export function discordEventDisplayCapacity(event: Event): number {
  return importedDisplayCapacities[event.id] ?? event.reservationCapacity ?? event.capacity + 1;
}
