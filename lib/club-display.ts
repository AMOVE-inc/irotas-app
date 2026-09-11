const CLUB_LEADER_TERMS = [
  "肉部長", "ゴルフ部長", "ランニング部長", "散歩部長", "スポーツ観戦部長", "旅行部長",
  "スイーツ部長", "スポーツ部長", "ディズニー部長", "舞台鑑賞部長", "料理教室部長", "ワイン部長", "パン部長", "昼飲み部長",
];

/** Club names are rendered alongside a separate icon, so preserve the catalog name and normalize only whitespace. */
export function formatClubName(name?: string | null) {
  return name?.normalize("NFKC").trim() || "部活動";
}

/** Display names do not carry rank, staff, or club-leader suffixes; those are represented by badges. */
export function formatClubLeaderName(name?: string | null) {
  let normalized = name?.normalize("NFKC") ?? "";
  normalized = normalized
    .replace(/\s*[【[(（]\s*(?:🥈|🥇|💎)?\s*(?:SILVER|GOLD|PLATINUM|シルバー|ゴールド|プラチナ)(?:会員)?\s*[】\])）]/gi, "")
    .replace(/\s*[【[(（]\s*(?:運営(?:メンバー)?|管理者|admin)\s*[】\])）]/gi, "");
  normalized = normalized.replace(/(?:🎞️?\s*)?映画[・･]?ドラマ鑑賞部長$/u, "");
  for (const term of CLUB_LEADER_TERMS) {
    normalized = normalized.replace(new RegExp(`(?:[🍖⛳🏃🚶⚾💃🎭🏀🍷✈️🍳🍞🐭🍺]\\s*)?${term}$`, "u"), "");
  }
  return normalized.trim() || "未設定";
}
