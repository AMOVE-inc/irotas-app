interface SitesEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  GOURMET_MAP_FEED_URL?: string;
}

function assetRequest(request: Request, pathname: string) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

export default {
  async fetch(request: Request, env: SitesEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/gourmet-map/feed" && request.method === "GET") {
      if (!env.GOURMET_MAP_FEED_URL) {
        return Response.json({ configured: false, restaurants: [] }, { status: 503 });
      }
      try {
        const feedResponse = await fetch(env.GOURMET_MAP_FEED_URL, {
          headers: { accept: "application/json" },
          redirect: "follow",
        });
        if (!feedResponse.ok) throw new Error(`Feed returned ${feedResponse.status}`);
        return new Response(await feedResponse.text(), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      } catch {
        return Response.json({ configured: true, restaurants: [] }, { status: 502 });
      }
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    if (!pathname.split("/").at(-1)?.includes(".")) {
      const routePath = pathname === "/" ? "/index.html" : `${pathname.replace(/\/$/, "")}.html`;
      const routeResponse = await env.ASSETS.fetch(assetRequest(request, routePath));
      if (routeResponse.status !== 404) return routeResponse;
    }

    return env.ASSETS.fetch(assetRequest(request, "/+not-found.html"));
  },
};
