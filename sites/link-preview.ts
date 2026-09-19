const ALLOWED_HOSTS = /(^|\.)(tabelog\.com|maps\.app\.goo\.gl|goo\.gl|google\.(?:[a-z]{2,3}|com\.[a-z]{2}|co\.[a-z]{2}))$/i;

async function fetchAllowedPage(initialUrl: URL): Promise<Response | null> {
  let target = initialUrl;
  for (let hop = 0; hop < 4; hop++) {
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.test(target.hostname) || target.username || target.password) return null;
    const response = await fetch(target, { redirect: "manual", headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (compatible; IROPlusPreview/1.0)" } });
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

function metaImage(html: string, baseUrl: string) {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/(?:property|name)=["'](?:og:image|twitter:image)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
    if (content) return new URL(content.replace(/&amp;/g, "&"), baseUrl).toString();
  }
  return null;
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
    let imageUrl: string | null = null;
    if (rawUrl) {
      const target = new URL(rawUrl);
      if (target.protocol === "https:" && ALLOWED_HOSTS.test(target.hostname)) {
        const response = await fetchAllowedPage(target);
        if (response?.ok && response.headers.get("content-type")?.includes("text/html")) imageUrl = metaImage((await response.text()).slice(0, 1_500_000), response.url);
      }
    }
    imageUrl ??= await placesImage(requestUrl.searchParams.get("query") ?? "", env, requestUrl.origin);
    return Response.json({ imageUrl }, { headers: { "cache-control": imageUrl ? "public, max-age=3600" : "public, max-age=300" } });
  } catch {
    return Response.json({ imageUrl: null });
  }
}
