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

type PreviewEnv = { GOOGLE_MAPS_API_KEY?: string };

async function placesImage(query: string, env: PreviewEnv, origin: string) {
  if (!query || !env.GOOGLE_MAPS_API_KEY) return null;
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GOOGLE_MAPS_API_KEY, "x-goog-fieldmask": "places.photos" }, body: JSON.stringify({ textQuery: query, languageCode: "ja", maxResultCount: 1 }) });
  if (!response.ok) return null;
  const value = await response.json() as { places?: { photos?: { name?: string }[] }[] };
  const name = value.places?.[0]?.photos?.[0]?.name;
  return name ? `${origin}/api/link-preview/image?name=${encodeURIComponent(name)}` : null;
}

export async function handleLinkPreviewRequest(request: Request, env: PreviewEnv): Promise<Response | null> {
  const requestUrl = new URL(request.url);
  if (!requestUrl.pathname.startsWith("/api/link-preview") || request.method !== "GET") return null;
  try {
    if (requestUrl.pathname === "/api/link-preview/image") {
      const name = requestUrl.searchParams.get("name") ?? "";
      if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name) || !env.GOOGLE_MAPS_API_KEY) return new Response(null, { status: 404 });
      const photo = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=1200&skipHttpRedirect=true`, { headers: { "x-goog-api-key": env.GOOGLE_MAPS_API_KEY } });
      if (!photo.ok) return new Response(null, { status: 404 });
      const value = await photo.json() as { photoUri?: string };
      return value.photoUri ? Response.redirect(value.photoUri, 302) : new Response(null, { status: 404 });
    }
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
    metadata.imageUrl ??= await placesImage(requestUrl.searchParams.get("query") ?? "", env, requestUrl.origin);
    return Response.json(metadata, { headers: { "cache-control": metadata.title || metadata.imageUrl ? "public, max-age=3600" : "public, max-age=300" } });
  } catch {
    return Response.json({ title: null, description: null, imageUrl: null });
  }
}
