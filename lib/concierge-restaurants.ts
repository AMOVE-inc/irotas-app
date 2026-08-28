import { RESTAURANTS, type Restaurant } from "../constants/mock-data";

const GENRE_ALIASES: Record<string, string[]> = {
  焼肉: ["焼肉", "焼き肉", "ホルモン"], 寿司: ["寿司", "鮨", "すし"],
  イタリアン: ["イタリアン", "パスタ", "ピザ"], フレンチ: ["フレンチ", "フランス料理"],
  和食: ["和食", "日本料理"], 中華: ["中華", "中国料理"], ラーメン: ["ラーメン", "つけ麺"],
  居酒屋: ["居酒屋", "酒場", "飲み屋"],
};

const AREA_WORDS = ["中目黒", "目黒", "渋谷", "新宿", "恵比寿", "代官山", "銀座", "六本木", "麻布", "池袋", "品川", "五反田", "上野", "浅草", "東京", "横浜", "大阪", "梅田", "難波", "京都", "神戸"];

export function restaurantsForConciergeQuery(query: string, restaurants: Restaurant[] = RESTAURANTS) {
  const normalized = query.replace(/焼き肉/g, "焼肉").toLowerCase();
  const area = AREA_WORDS.find((word) => normalized.includes(word.toLowerCase()));
  const genre = Object.entries(GENRE_ALIASES).find(([, aliases]) => aliases.some((word) => normalized.includes(word.toLowerCase())));
  return restaurants.filter((restaurant) => {
    const haystack = `${restaurant.name} ${restaurant.genre} ${restaurant.address} ${restaurant.description}`.replace(/焼き肉/g, "焼肉").toLowerCase();
    return (!area || haystack.includes(area.toLowerCase())) && (!genre || genre[1].some((word) => haystack.includes(word.toLowerCase())));
  });
}
