export const OFFICIAL_LINE_URL = "https://lin.ee/Rr00sCb";

/** Google Maps の共有済み保存リストURL。公開ビルド時に環境変数から設定する。 */
export const GOOGLE_GOURMET_MAP_URL =
  process.env.EXPO_PUBLIC_GOOGLE_GOURMET_MAP_URL?.trim() ?? "";
