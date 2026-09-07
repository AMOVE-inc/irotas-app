import type { Event } from "../constants/mock-data";
import { extractEventLocation } from "./event-location";

const GENRE_KEYWORDS: readonly (readonly [string, readonly string[]])[] = [
  ["日本料理", ["日本料理", "懐石", "割烹"]], ["寿司", ["寿司", "鮨"]], ["海鮮", ["海鮮", "魚介", "マグロ", "鮪"]],
  ["うなぎ・穴子", ["うなぎ", "鰻", "穴子"]], ["天ぷら", ["天ぷら", "天婦羅"]], ["とんかつ・揚げ物", ["とんかつ", "揚げ物", "フライ"]],
  ["焼き鳥・串焼き", ["焼き鳥", "串焼き", "焼鳥"]], ["すき焼き・しゃぶしゃぶ", ["すき焼き", "しゃぶしゃぶ"]], ["そば・うどん", ["そば", "蕎麦", "うどん"]],
  ["お好み焼き・たこ焼き", ["お好み焼き", "たこ焼き"]], ["ステーキ・鉄板焼き", ["ステーキ", "鉄板焼き"]], ["フレンチ", ["フレンチ", "フランス料理"]],
  ["イタリアン", ["イタリアン", "イタリア料理", "パスタ", "ピザ"]], ["スペイン料理", ["スペイン料理", "スペイン"]], ["中華料理", ["中華", "餃子", "四川"]],
  ["韓国料理", ["韓国料理", "韓国", "サムギョプサル"]], ["タイ料理", ["タイ料理"]], ["インド料理", ["インド料理", "カレー"]],
  ["焼肉", ["焼肉"]], ["ホルモン", ["ホルモン"]], ["ラーメン", ["ラーメン", "らーめん"]], ["居酒屋", ["居酒屋", "酒場", "バル"]],
  ["カフェ・喫茶店", ["カフェ", "喫茶"]], ["スイーツ", ["スイーツ", "デザート", "ケーキ"]], ["バー", ["バー", "BAR"]],
];

export function getEventSearchText(event: Event): string {
  return [event.title, event.restaurantName, event.description, event.location].filter(Boolean).join(" ");
}

/** Supplements imported records only at read time; it never changes stored event data. */
export function resolveEventGenres(event: Event): string[] {
  const searchText = getEventSearchText(event).toLowerCase();
  const inferred = GENRE_KEYWORDS.filter(([, keywords]) => keywords.some((keyword) => searchText.includes(keyword.toLowerCase()))).map(([genre]) => genre);
  return [...new Set([...(event.genres ?? []), ...inferred])];
}

export function resolveEventLocation(event: Event) {
  return extractEventLocation(getEventSearchText(event));
}
