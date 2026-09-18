const CLUB_LEADER_BADGES = [
  { term: "肉部長", label: "🍖肉部長" },
  { term: "ゴルフ部長", label: "⛳ゴルフ部長" },
  { term: "ランニング部長", label: "🏃ランニング部長" },
  { term: "散歩部長", label: "🚶散歩部長" },
  { term: "スポーツ観戦部長", label: "⚾スポーツ観戦部長" },
  { term: "旅行部長", label: "✈️旅行部長" },
  { term: "スイーツ部長", label: "🍰スイーツ部長" },
  { term: "スポーツ部長", label: "🏀スポーツ部長" },
  { term: "ディズニー部長", label: "🐭ディズニー部長" },
  { term: "舞台鑑賞部長", label: "🎭舞台鑑賞部長" },
  { term: "料理教室部長", label: "🍳料理教室部長" },
  { term: "ワイン部長", label: "🍷ワイン部長" },
  { term: "パン部長", label: "🍞パン部長" },
  { term: "昼飲み部長", label: "🍺昼飲み部長" },
];

export function clubLeaderBadge(name: string) {
  return CLUB_LEADER_BADGES.find(({ term }) => name.includes(term));
}

export function clubLeaderBadgeForClub(clubName: string) {
  const normalized = clubName.replace(/部$/, "");
  return CLUB_LEADER_BADGES.find(({ term }) => term.replace(/部長$/, "") === normalized)?.label
    ?? `${clubName}長`;
}

export function clubLeaderBadgesForRoles(roles?: readonly string[] | null) {
  if (!roles?.length) return [];
  return CLUB_LEADER_BADGES
    .filter(({ term }) => roles.some((role) => role.includes(term)))
    .map(({ label }) => label);
}

export function clubLeaderTerms() {
  return CLUB_LEADER_BADGES.map(({ term }) => term);
}
