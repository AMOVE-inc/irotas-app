/** Discord forum keys are normalized to the current app club IDs at every boundary. */
export function normalizeDiscordBoardCategory(category: string): string {
  switch (category) {
    case "gourmet-consultation": return "gourmet-advice";
    case "free-board": return "free-chat";
    case "club-club-sports-viewing": return "club-club-sports-watch";
    case "club-club-cooking": return "club-club-cooking-class";
    case "club-club-stage": return "club-club-theater";
    case "gourmet-board-kanto":
    case "gourmet-board-kansai": return "free-chat";
    default: return category;
  }
}

export function isRetiredMovieClubThread(record: { category: string; title: string }): boolean {
  return record.category === "club-club-movie"
    || (record.category === "club-all" && /映画[・･]?ドラマ鑑賞部/.test(record.title));
}
