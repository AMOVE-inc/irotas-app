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
  "〜3,000円",
  "3,000〜5,000円",
  "5,000〜10,000円",
  "10,000〜20,000円",
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
