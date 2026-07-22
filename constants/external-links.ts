export const OFFICIAL_LINE_URL = "https://lin.ee/Rr00sCb";
export const OFFICIAL_INSTAGRAM_URL = "https://www.instagram.com/irotas_community_official";
export const COMMUNITY_TERMS_URL = "https://irotas-community.com/terms";
export const EVENT_TERMS_URL = "https://irotas-community.com/event-terms";

/** Google Maps の共有済み保存リストURL。公開ビルド時に環境変数から設定する。 */
export const GOOGLE_GOURMET_MAP_URL =
  process.env.EXPO_PUBLIC_GOOGLE_GOURMET_MAP_URL?.trim() ?? "";
