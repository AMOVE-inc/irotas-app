export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県",
  "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県", "海外",
] as const;

export const DRINKING_LEVELS = [
  "たくさん飲める",
  "飲める",
  "少しだけ飲める",
  "全く飲めない",
  "日による",
] as const;

export const GOOGLE_LOCAL_GUIDE_LEVELS = [
  "未設定",
  ...Array.from({ length: 10 }, (_, index) => `レベル${index + 1}`),
] as const;

export const BIRTH_YEARS = Array.from({ length: 83 }, (_, index) => String(new Date().getFullYear() - 18 - index));
export const MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
export const DAYS = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"));

export const PROFILE_DETAILS_STORAGE_KEY = "profile_details_v1";

export interface ProfileDetails {
  birthDate: string;
  showAge: boolean;
  hometown: string;
  residence: string;
  occupation: string;
  hobbies: string;
  favoriteCuisines: string[];
  favoriteAlcohol: string;
  dislikedFoods: string;
  allergies: string;
  drinkingLevel: string;
  instagramUrl: string;
  tabelogUrl: string;
  favoriteRestaurants: string;
  desiredRestaurants: string;
  googleLocalGuideLevel: string;
}
