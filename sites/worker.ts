interface SitesEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

function assetRequest(request: Request, pathname: string) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

export default {
  async fetch(request: Request, env: SitesEnv): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const { pathname } = new URL(request.url);
    if (!pathname.split("/").at(-1)?.includes(".")) {
      const routePath = pathname === "/" ? "/index.html" : `${pathname.replace(/\/$/, "")}.html`;
      const routeResponse = await env.ASSETS.fetch(assetRequest(request, routePath));
      if (routeResponse.status !== 404) return routeResponse;
    }

    return env.ASSETS.fetch(assetRequest(request, "/+not-found.html"));
  },
};
