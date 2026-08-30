const ALLOWED_HOSTS = /(^|\.)(tabelog\.com|maps\.app\.goo\.gl|goo\.gl|google\.[a-z.]+|maps\.google\.[a-z.]+)$/i;

function metaImage(html: string, baseUrl: string) {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/(?:property|name)=["'](?:og:image|twitter:image)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
    if (content) return new URL(content.replace(/&amp;/g, "&"), baseUrl).toString();
  }
  return null;
}

export async function handleLinkPreviewRequest(request: Request): Promise<Response | null> {
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname !== "/api/link-preview" || request.method !== "GET") return null;
  try {
    const rawUrl = requestUrl.searchParams.get("url");
    if (!rawUrl) return Response.json({ imageUrl: null }, { status: 400 });
    const target = new URL(rawUrl);
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.test(target.hostname)) return Response.json({ imageUrl: null }, { status: 400 });
    const response = await fetch(target, { redirect: "follow", headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (compatible; IROPlusPreview/1.0)" } });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return Response.json({ imageUrl: null });
    const html = (await response.text()).slice(0, 1_500_000);
    return Response.json({ imageUrl: metaImage(html, response.url) }, { headers: { "cache-control": "public, max-age=3600" } });
  } catch {
    return Response.json({ imageUrl: null });
  }
}
