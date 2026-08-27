import { PREFECTURES } from "../constants/profile-options";

export const TOKYO_EVENT_AREAS = [
  { key: "roppongi-azabu", label: "六本木・麻布・西麻布", keywords: ["六本木", "麻布", "西麻布", "東麻布", "南麻布", "元麻布"] },
  { key: "ebisu-daikanyama-nakameguro", label: "恵比寿・代官山・中目黒", keywords: ["恵比寿", "代官山", "中目黒"] },
  { key: "ginza-yurakucho-hibiya", label: "銀座・有楽町・日比谷", keywords: ["銀座", "有楽町", "日比谷"] },
  { key: "omotesando-aoyama", label: "表参道・青山", keywords: ["表参道", "青山"] },
  { key: "akasaka-tameikesanno", label: "赤坂・溜池山王", keywords: ["赤坂", "溜池山王"] },
  { key: "shibuya-shinsen", label: "渋谷・神泉", keywords: ["渋谷", "神泉"] },
  { key: "shinjuku-yoyogi", label: "新宿・代々木", keywords: ["新宿", "代々木"] },
  { key: "kagurazaka-iidabashi", label: "神楽坂・飯田橋", keywords: ["神楽坂", "飯田橋"] },
  { key: "shimbashi-toranomon", label: "新橋・虎ノ門", keywords: ["新橋", "虎ノ門"] },
  { key: "ueno-asakusa-east", label: "上野・浅草・東東京", keywords: ["上野", "浅草", "台東区", "墨田区", "江東区", "葛飾区", "江戸川区", "足立区", "荒川区"] },
  { key: "other", label: "その他", keywords: [] },
] as const;

export type TokyoEventAreaKey = (typeof TOKYO_EVENT_AREAS)[number]["key"];

export function extractEventLocation(address: string): { prefecture?: string; tokyoArea?: TokyoEventAreaKey } {
  const prefecture = PREFECTURES.find((item) => address.includes(item));
  if (prefecture !== "東京都") return { prefecture };
  const area = TOKYO_EVENT_AREAS.find((item) => item.key !== "other" && item.keywords.some((keyword) => address.includes(keyword)));
  return { prefecture, tokyoArea: area?.key ?? "other" };
}

export function eventCategoryFromPrefecture(prefecture?: string): "all" | "kanto" | "kansai" {
  if (["東京都", "神奈川県", "埼玉県", "千葉県", "茨城県", "栃木県", "群馬県"].includes(prefecture ?? "")) return "kanto";
  if (["大阪府", "京都府", "兵庫県", "奈良県", "滋賀県", "和歌山県"].includes(prefecture ?? "")) return "kansai";
  return "all";
}

export function formatEventArea(prefecture?: string, tokyoArea?: string, fallback = "場所未設定"): string {
  if (!prefecture) return fallback;
  const prefectureLabel = prefecture.replace(/[都府県]$/, "");
  if (prefecture !== "東京都") return prefectureLabel;
  const resolvedTokyoArea = tokyoArea ?? extractEventLocation(fallback).tokyoArea;
  const area = TOKYO_EVENT_AREAS.find((item) => item.key === resolvedTokyoArea);
  return area?.label ?? "その他";
}
