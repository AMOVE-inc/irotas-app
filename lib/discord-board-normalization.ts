const RECRUITMENT_PREFIX = /^\s*【\s*(?:募集中|開催中|開催終了)\s*】\s*/;

export function cleanDiscordBoardTitle(title: string): string {
  return title.replace(RECRUITMENT_PREFIX, "").trim();
}

function comparable(value: string): string {
  return cleanDiscordBoardTitle(value).normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

export function cleanDiscordBoardContent(title: string, content: string, category: string): string {
  if (category !== "free-chat") return content.trim();
  const lines = content.split(/\r?\n/);
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentLine < 0 || comparable(lines[firstContentLine]) !== comparable(title)) return content.trim();
  lines.splice(firstContentLine, 1);
  return lines.join("\n").replace(/^\s+/, "").trim();
}
