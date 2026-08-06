export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

export const MEAL_BUDGETS = [
  "〜¥999",
  ...Array.from({ length: 29 }, (_, index) => `¥${((index + 1) * 1000).toLocaleString()}〜¥${(((index + 2) * 1000) - 1).toLocaleString()}`),
  "¥30,000〜",
];

export const MEAL_REPORT_AREAS = [
  "関東｜東京（全域）",
  "関東｜東京｜六本木・麻布・西麻布",
  "関東｜東京｜恵比寿・代官山・中目黒",
  "関東｜東京｜銀座・有楽町・日比谷",
  "関東｜東京｜表参道・青山",
  "関東｜東京｜赤坂・溜池山王",
  "関東｜東京｜渋谷・神泉",
  "関東｜東京｜新宿・代々木",
  "関東｜東京｜神楽坂・飯田橋",
  "関東｜東京｜新橋・虎ノ門",
  "関東｜東京｜上野・浅草・東東京",
  "関東｜東京｜その他",
  "関東｜東京以外",
  "関西",
  "その他",
];

export const GOURMET_ADVICE_BUDGETS = [
  "〜3,000円",
  "3,000〜5,000円",
  "5,000〜6,000円",
  "6,000〜8,000円",
  "8,000〜10,000円",
  "10,000〜15,000円",
  "15,000〜20,000円",
  "20,000円〜",
] as const;

export function isGoogleMapsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "maps.app.goo.gl" ||
      hostname === "maps.google.com" ||
      hostname === "www.google.com" ||
      hostname.endsWith(".google.com")
    ) && (hostname.includes("maps") || url.pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}
