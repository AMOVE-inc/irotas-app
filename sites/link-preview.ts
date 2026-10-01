import { archivedTabelogImages, archivedTabelogTitles, canonicalTabelogUrl } from "../lib/discord-link-preview";

const GOOGLE_HOSTS = /(^|\.)(maps\.app\.goo\.gl|goo\.gl|google\.(?:[a-z]{2,3}|com\.[a-z]{2}|co\.[a-z]{2}))$/i;
const TABELOG_HOSTS = /(^|\.)tabelog\.com$/i;
const INTERNAL_APP_HOSTS = /(^|\.)irotas-community\.com$/i;
const LEGACY_INTERNAL_APP_HOSTS = /^irotas-app-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.chatgpt\.site$/i;
const BLOCKED_HOSTS = /(^|\.)(localhost|local|internal|lan|home|invalid)$/i;
const IPV4_HOST = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isSafeExternalPreviewUrl(target: URL): boolean {
  const hostname = target.hostname.toLowerCase();
  return target.protocol === "https:"
    && !target.username
    && !target.password
    && (!target.port || target.port === "443")
    && hostname.includes(".")
    && !IPV4_HOST.test(hostname)
    && !hostname.includes(":")
    && !BLOCKED_HOSTS.test(hostname)
    && !INTERNAL_APP_HOSTS.test(hostname)
    && !LEGACY_INTERNAL_APP_HOSTS.test(hostname);
}

function isAllowedRedirect(initialUrl: URL, target: URL): boolean {
  if (!isSafeExternalPreviewUrl(target)) return false;
  if (TABELOG_HOSTS.test(initialUrl.hostname)) return TABELOG_HOSTS.test(target.hostname);
  if (GOOGLE_HOSTS.test(initialUrl.hostname)) return GOOGLE_HOSTS.test(target.hostname);
  return initialUrl.hostname.toLowerCase() === target.hostname.toLowerCase();
}

async function fetchPreviewPage(initialUrl: URL): Promise<{ response: Response; finalUrl: URL } | null> {
  let target = initialUrl;
  for (let hop = 0; hop < 4; hop++) {
    if (!isAllowedRedirect(initialUrl, target)) return null;
    const response = await fetch(target, { redirect: "manual", headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      target = new URL(location, target);
      continue;
    }
    return { response, finalUrl: target };
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
  const titleTag = decodeMeta(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "");
  let structured: Record<string, unknown> = {};
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1]);
      const records = Array.isArray(value) ? value : value?.["@graph"] && Array.isArray(value["@graph"]) ? value["@graph"] : [value];
      const restaurant = records.find((item: unknown) => item && typeof item === "object" && /Restaurant|FoodEstablishment/i.test(String((item as Record<string, unknown>)["@type"] ?? "")));
      if (restaurant) { structured = restaurant as Record<string, unknown>; break; }
    } catch { /* Ignore malformed publisher metadata. */ }
  }
  let imageUrl: string | null = null;
  try {
    const structuredImage = Array.isArray(structured.image) ? structured.image[0] : structured.image;
    const candidate = new URL(values["og:image"] ?? values["twitter:image"] ?? String(structuredImage ?? ""), baseUrl);
    if (candidate.protocol === "https:") imageUrl = candidate.toString();
  } catch { /* A page without an image can still supply a title. */ }
  return {
    title: (values["og:title"] ?? values["twitter:title"] ?? (typeof structured.name === "string" ? structured.name : null) ?? titleTag) || null,
    description: values["og:description"] ?? values.description ?? (typeof structured.description === "string" ? structured.description : null),
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
      if (isSafeExternalPreviewUrl(target)) {
        const fetched = await fetchPreviewPage(target);
        if (fetched?.response.ok && fetched.response.headers.get("content-type")?.includes("text/html")) metadata = pagePreviewMetadata((await fetched.response.text()).slice(0, 1_500_000), fetched.finalUrl.toString());
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
