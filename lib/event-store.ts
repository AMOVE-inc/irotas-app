/**
 * シンプルなモジュールレベルのイベントストア
 * create-event.tsx で追加されたイベントを events.tsx で表示するために使用
 */
import type { Event } from "@/constants/mock-data";

// 追加されたイベントを保持するグローバル配列
export const pendingEvents: Event[] = [];

// 全イベントを取得（モックデータ + 追加分）
export function getAllEvents(baseEvents: Event[]): Event[] {
  return [...pendingEvents, ...baseEvents];
}
