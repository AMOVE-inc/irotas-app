import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const MEDIA_PATH = /^\/(discord-board|discord-benefits|discord-gourmet-contests)\/[a-zA-Z0-9/_-]+\.(?:webp|jpe?g|png|gif|mp4|mov|webm)$/;
const MIGRATION_PATH = "/api/admin/discord-media-migration";

function mediaKey(pathname: string) {
  return `private-migration-media${pathname}`;
}

function mediaType(pathname: string) {
  const extension = pathname.split(".").at(-1)?.toLowerCase();
  return ({ webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
}

export async function handleImportedMediaRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== MIGRATION_PATH && !MEDIA_PATH.test(pathname)) return null;
  const headers = { "cache-control": "private, no-store", vary: "Cookie, Authorization" };

  if (pathname === MIGRATION_PATH) {
    if (request.method !== "POST") return Response.json({ error: "not found" }, { status: 404, headers });
    if (!env.MEDIA_MIGRATION_TOKEN || request.headers.get("x-migration-token") !== env.MEDIA_MIGRATION_TOKEN)
      return Response.json({ error: "not found" }, { status: 404, headers });
    if (!env.UPLOADS) return Response.json({ error: "storage unavailable" }, { status: 503, headers });
    const payload = await request.json().catch(() => null) as { paths?: unknown } | null;
    const paths = payload?.paths;
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > 20 || paths.some((path) => typeof path !== "string" || !MEDIA_PATH.test(path)))
      return Response.json({ error: "invalid paths" }, { status: 400, headers });
    const uploaded: string[] = [];
    const failed: string[] = [];
    for (const path of paths) {
      try {
        const asset = await env.ASSETS.fetch(new Request(new URL(path, request.url)));
        if (!asset.ok) { failed.push(path); continue; }
        await env.UPLOADS.put(mediaKey(path), await asset.arrayBuffer(), { httpMetadata: { contentType: mediaType(path) } });
        uploaded.push(path);
      } catch {
        failed.push(path);
      }
    }
    return Response.json({ uploaded, failed }, { headers });
  }

  if (!["GET", "HEAD"].includes(request.method)) return Response.json({ error: "method not allowed" }, { status: 405 });
  const member = await authenticatedRequestMember(request, env);
  if (!member) return Response.json({ error: "ログインが必要です" }, { status: 401, headers });
  const object = await env.UPLOADS?.get(mediaKey(pathname));
  if (object) return new Response(request.method === "HEAD" ? null : object.body, {
    headers: { ...headers, "content-type": object.httpMetadata?.contentType ?? mediaType(pathname) },
  });
  return Response.json({ error: "not found" }, { status: 404, headers });
}
