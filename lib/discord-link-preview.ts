export interface ImportedLinkPreview {
  url: string;
  title: string;
  description?: string;
  provider: "Google マップ" | "食べログ";
}

const LINK = /https:\/\/(?:maps\.app\.goo\.gl|(?:www\.)?google\.[^\s/]+\/maps|(?:www\.)?tabelog\.com)\/[^\s<>]+/gi;
const TABELOG_DETAIL = /^★[★☆]+\d(?:\.\d+)?\s+■/;
const MAPS_DETAIL = /^(.+?)\s+·\s+[\d.]+★(?:\([\d,]+\))?\s+·\s+(.+)$/;

/** Discord's embed text was appended to some archived messages. Keep the authored text and links intact. */
export function extractDiscordLinkPreviews(content: string): { content: string; previews: ImportedLinkPreview[] } {
  if (!/maps\.app\.goo\.gl|google\.[^\s/]+\/maps|tabelog\.com/i.test(content)) return { content, previews: [] };
  const lines = content.split(/\r?\n/);
  const links = [...content.matchAll(LINK)].map((match) => match[0].replace(/[),.、。]+$/, ""));
  const tabelogLinks = links.filter((link) => /tabelog\.com/i.test(link));
  const mapsLinks = links.filter((link) => /maps\.app\.goo\.gl|google\.[^/]+\/maps/i.test(link));
  const previews: ImportedLinkPreview[] = [];
  let tabelogCount = 0;
  let mapsCount = 0;
  let end = lines.length;
  while (end > 0 && !lines[end - 1].trim()) end--;

  // A Tabelog embed consists of a title and the rating/budget line.
  while (end >= 2 && TABELOG_DETAIL.test(lines[end - 1].trim()) && lines[end - 2].trim() && !/^https?:\/\//.test(lines[end - 2].trim())) {
    const url = tabelogLinks[tabelogLinks.length - ++tabelogCount];
    if (!url) break;
    previews.unshift({ url, title: lines[end - 2].trim(), description: lines[end - 1].trim(), provider: "食べログ" });
    end -= 2;
  }

  // A Google Maps embed consists of a place/rating line and an address.
  while (end >= 2 && MAPS_DETAIL.test(lines[end - 2].trim()) && lines[end - 1].trim() && !/^https?:\/\//.test(lines[end - 1].trim())) {
    const url = mapsLinks[mapsLinks.length - ++mapsCount];
    if (!url) break;
    const detail = lines[end - 2].trim().match(MAPS_DETAIL)!;
    previews.unshift({ url, title: detail[1], description: `${detail[2]} · ${lines[end - 1].trim()}`, provider: "Google マップ" });
    end -= 2;
  }

  return previews.length ? { content: lines.slice(0, end).join("\n").trimEnd(), previews } : { content, previews: [] };
}
