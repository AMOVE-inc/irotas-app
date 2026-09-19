import { tokenizeRichTextLinks } from "./discord-rich-text";
import type { ImportedLinkPreview } from "./discord-link-preview";

export function contentLinkCards(content: string, existing: readonly ImportedLinkPreview[] = []): ImportedLinkPreview[] {
  const seen = new Set(existing.map((item) => item.url));
  const cards: ImportedLinkPreview[] = [];
  for (const token of tokenizeRichTextLinks(content)) {
    if (token.type !== "link") continue;
    let url: URL;
    try { url = new URL(token.url); } catch { continue; }
    if (!(["http:", "https:"].includes(url.protocol)) || seen.has(url.href)) continue;
    seen.add(url.href);
    const provider = /(^|\.)tabelog\.com$/i.test(url.hostname) ? "食べログ"
      : /(^|\.)(?:google\.[a-z.]+|maps\.app\.goo\.gl)$/i.test(url.hostname) ? "Google マップ"
      : url.hostname.replace(/^www\./i, "");
    const explicitTitle = token.label !== token.url ? token.label : "";
    cards.push({ url: url.href, provider, title: explicitTitle || `${provider}のリンクを開く`, description: explicitTitle ? url.hostname : url.href });
  }
  return cards;
}
