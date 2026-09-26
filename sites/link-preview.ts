import { archivedTabelogImages, archivedTabelogTitles, canonicalTabelogUrl } from "../lib/discord-link-preview";

const ALLOWED_HOSTS = /(^|\.)(tabelog\.com|maps\.app\.goo\.gl|goo\.gl|google\.(?:[a-z]{2,3}|com\.[a-z]{2}|co\.[a-z]{2}))$/i;

async function fetchAllowedPage(initialUrl: URL): Promise<Response | null> {
  let target = initialUrl;
  for (let hop = 0; hop < 4; hop++) {
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.test(target.hostname) || target.username || target.password) return null;
    const response = await fetch(target, { redirect: "manual", headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      target = new URL(location, target);
      continue;
    }
    return response;
  }
  return null;
}

function decodeMeta(value: string) {
  return value.replace(/&(?:amp|quot|#39|lt|gt|#(\d+)|#x([0-9a-f]+));/gi, (entity, decimal, hex) => {
    if (decimal || hex) return String.fromCodePoint(parseInt(decimal ?? hex, hex ? 16 : 10));
    return ({ "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" } as Record<string, string>)[entity.toLowerCase()] ?? entity;
  });
}

export function pagePreviewMetadata(html: string, baseUrl: string): { title: string | null; description: string | null; imageUrl: string | null } {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? [];
  const values: Record<string, string> = {};
  for (const tag of tags) {
    const name = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    if (name && content) values[name] = decodeMeta(content).trim();
  }
  let imageUrl: string | null = null;
  try {
    const candidate = new URL(values["og:image"] ?? values["twitter:image"], baseUrl);
    if (candidate.protocol === "https:") imageUrl = candidate.toString();
  } catch { /* A page without an image can still supply a title. */ }
  return {
    title: values["og:title"] ?? values["twitter:title"] ?? null,
    description: values["og:description"] ?? values.description ?? null,
    imageUrl,
  };
}

export async function handleLinkPreviewRequest(request: Request, _env?: unknown): Promise<Response | null> {
  const requestUrl = new URL(request.url);
  if (!requestUrl.pathname.startsWith("/api/link-preview") || request.method !== "GET") return null;
  try {
    const rawUrl = requestUrl.searchParams.get("url");
    let metadata: ReturnType<typeof pagePreviewMetadata> = { title: null, description: null, imageUrl: null };
    if (rawUrl) {
      const target = new URL(rawUrl);
      if (target.protocol === "https:" && ALLOWED_HOSTS.test(target.hostname)) {
        const response = await fetchAllowedPage(target);
        if (response?.ok && response.headers.get("content-type")?.includes("text/html")) metadata = pagePreviewMetadata((await response.text()).slice(0, 1_500_000), response.url || target.toString());
        const knownUrl = canonicalTabelogUrl(target.toString());
        if (knownUrl) {
          metadata.title ??= archivedTabelogTitles[knownUrl] ?? null;
          metadata.imageUrl ??= archivedTabelogImages[knownUrl] ?? null;
        }
      }
    }
    return Response.json(metadata, { headers: { "cache-control": metadata.title || metadata.imageUrl ? "public, max-age=3600" : "public, max-age=300" } });
  } catch {
    return Response.json({ title: null, description: null, imageUrl: null });
  }
}
