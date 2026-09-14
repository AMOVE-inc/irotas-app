import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const MEDIA_PATH = /^\/(discord-board|discord-benefits|discord-gourmet-contests)\/[a-zA-Z0-9/_-]+\.(?:webp|jpe?g|png|gif|mp4|mov|webm)$/;

function mediaKey(pathname: string) {
  return `private-migration-media${pathname}`;
}

function mediaType(pathname: string) {
  const extension = pathname.split(".").at(-1)?.toLowerCase();
  return ({ webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
}

export async function handleImportedMediaRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (!MEDIA_PATH.test(pathname)) return null;
  const headers = { "cache-control": "private, no-store", vary: "Cookie, Authorization" };

  if (!["GET", "HEAD"].includes(request.method)) return Response.json({ error: "method not allowed" }, { status: 405 });
  const member = await authenticatedRequestMember(request, env);
  if (!member) return Response.json({ error: "ログインが必要です" }, { status: 401, headers });
  const object = await env.UPLOADS?.get(mediaKey(pathname));
  if (object) return new Response(request.method === "HEAD" ? null : object.body, {
    headers: { ...headers, "content-type": object.httpMetadata?.contentType ?? mediaType(pathname) },
  });
  return Response.json({ error: "not found" }, { status: 404, headers });
}
