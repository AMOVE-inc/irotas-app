import { tokenizeRichTextLinks } from "./discord-rich-text";
import { archivedTabelogImages, archivedTabelogTitles, canonicalTabelogUrl, type ImportedLinkPreview } from "./discord-link-preview";

const IROTAS_APP_HOST = /(^|\.)irotas-community\.com$/i;
const LEGACY_IROTAS_APP_HOST = /^irotas-app-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.chatgpt\.site$/i;

/** Internal deep links remain clickable in the message body, but do not need an external-site preview card. */
export function isInternalAppUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return IROTAS_APP_HOST.test(url.hostname) || LEGACY_IROTAS_APP_HOST.test(url.hostname);
  } catch {
    return false;
  }
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
    if (!(["http:", "https:"].includes(url.protocol)) || seen.has(url.href) || isInternalAppUrl(url.href)) continue;
    seen.add(url.href);
    const provider = /(^|\.)tabelog\.com$/i.test(url.hostname) ? "食べログ"
      : /(^|\.)(?:google\.[a-z.]+|maps\.app\.goo\.gl)$/i.test(url.hostname) ? "Google マップ"
      : url.hostname.replace(/^www\./i, "");
    const explicitTitle = token.label !== token.url ? token.label : "";
    const knownUrl = provider === "食べログ" ? canonicalTabelogUrl(url.href) : null;
    // Surrounding chat prose is not restaurant metadata. Let the preview API
    // resolve the canonical restaurant name instead of leaking text such as
    // "牛肉のタルタルが最高" into the card title.
    const title = explicitTitle || (knownUrl ? archivedTabelogTitles[knownUrl] : "") || `${provider}のリンクを開く`;
    cards.push({ url: url.href, provider, title, description: title.endsWith("のリンクを開く") ? url.href : url.hostname, imageUrl: knownUrl ? archivedTabelogImages[knownUrl] : undefined });
  }
  return cards;
}
