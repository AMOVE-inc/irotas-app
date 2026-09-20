import { tokenizeRichTextLinks } from "./discord-rich-text";
import type { ImportedLinkPreview } from "./discord-link-preview";

function nearbyRestaurantName(content: string, urlStart: number): string {
  const lines = content.slice(Math.max(0, urlStart - 350), urlStart).split(/\r?\n/).slice(-5).reverse();
  for (const original of lines) {
    const line = original.trim().replace(/^(?:🍴\s*)?(?:店名\s*[：:]\s*)?/, "").trim();
    if (!line || /^https?:\/\//i.test(line) || /^(?:〒|東京都|北海道|(?:大阪|京都)府|.{2,4}県|\d{2,4}-\d{2,4}-\d{3,4})/.test(line)) continue;
    const name = line.split(/\s+0\d{1,4}-\d{1,4}-\d{3,4}(?:\s|$)/)[0].trim();
    if (name.length >= 2 && name.length <= 65 && !/[。！？!?]/.test(name)) return name;
  }
  return "";
}

export function contentLinkCards(content: string, existing: readonly ImportedLinkPreview[] = []): ImportedLinkPreview[] {
  const seen = new Set(existing.map((item) => item.url));
  const cards: ImportedLinkPreview[] = [];
  let searchFrom = 0;
  for (const token of tokenizeRichTextLinks(content)) {
    if (token.type !== "link") continue;
    const urlStart = content.indexOf(token.url, searchFrom);
    if (urlStart >= 0) searchFrom = urlStart + token.url.length;
    let url: URL;
    try { url = new URL(token.url); } catch { continue; }
    if (!(["http:", "https:"].includes(url.protocol)) || seen.has(url.href)) continue;
    seen.add(url.href);
    const provider = /(^|\.)tabelog\.com$/i.test(url.hostname) ? "食べログ"
      : /(^|\.)(?:google\.[a-z.]+|maps\.app\.goo\.gl)$/i.test(url.hostname) ? "Google マップ"
      : url.hostname.replace(/^www\./i, "");
    const explicitTitle = token.label !== token.url ? token.label : "";
    const nearbyName = provider === "食べログ" && urlStart >= 0 ? nearbyRestaurantName(content, urlStart) : "";
    cards.push({ url: url.href, provider, title: explicitTitle || nearbyName || `${provider}のリンクを開く`, description: explicitTitle || nearbyName ? url.hostname : url.href });
  }
  return cards;
}
