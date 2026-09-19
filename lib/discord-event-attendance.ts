import type { Event } from "../constants/mock-data";

// Discordで確定した人数を、移行元のイベントIDに紐づけて保持する。
// アプリで確定者が登録された場合は、その最新の参加者一覧を優先する。
const importedConfirmedCounts: Record<string, number> = {
  "discord-event-1544896603603738664": 7, // 10/2 野毛みかん
  "discord-event-1545430214082039808": 3, // 10/4 日本酒イベント
  "discord-event-1543599911507861514": 0, // 10/9 さわいし
  "discord-event-1546174424619946014": 8, // 10/15 韓国料理
  "discord-event-1547564106469613568": 3, // 10/17 うしの絵
  "discord-event-1542148647565660321": 3, // 10/20 前芝料理店
  "discord-event-1545794805269798983": 3, // 10/24 炭火焼ゆうじ
};

export function discordEventConfirmedCount(event: Event): number | null {
  const imported = importedConfirmedCounts[event.id];
  if (imported === undefined) return null;
  const confirmedIds = new Set(event.participants ?? []);
  return confirmedIds.size > 0 ? confirmedIds.size : imported;
}
