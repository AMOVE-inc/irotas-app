/** 食べログの料理ジャンル一覧を参考に、イベント検索向けに整理した代表ジャンル。 */
export const GOURMET_GENRES = [
  "日本料理",
  "寿司",
  "海鮮",
  "うなぎ・穴子",
  "天ぷら",
  "とんかつ・揚げ物",
  "焼き鳥・串焼き",
  "すき焼き・しゃぶしゃぶ",
  "そば・うどん",
  "お好み焼き・たこ焼き",
  "洋食",
  "ステーキ・鉄板焼き",
  "フレンチ",
  "イタリアン",
  "スペイン料理",
  "中華料理",
  "韓国料理",
  "タイ料理",
  "インド料理",
  "焼肉",
  "ホルモン",
  "ラーメン",
  "カレー",
  "居酒屋",
  "カフェ・喫茶店",
  "スイーツ",
  "バー",
  "その他",
] as const;

export const EVENT_BUDGET_RANGES = [
  { key: "all", label: "指定なし" },
  { key: "under3000", label: "3,000円以下", max: 3000 },
  { key: "3000to5000", label: "3,000〜5,000円", min: 3000, max: 5000 },
  { key: "5000to10000", label: "5,000〜10,000円", min: 5000, max: 10000 },
  { key: "10000to20000", label: "10,000〜20,000円", min: 10000, max: 20000 },
  { key: "over20000", label: "20,000円以上", min: 20000 },
] as const;

export type EventBudgetRangeKey = (typeof EVENT_BUDGET_RANGES)[number]["key"];
