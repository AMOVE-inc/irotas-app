interface SitesEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  GOURMET_MAP_FEED_URL?: string;
  GOOGLE_MAPS_API_KEY?: string;
}

type CommunitySubmission = {
  reportId: string;
  reportTitle: string;
  restaurantName: string;
  area: string;
  memberRating: number;
  googleMapsUrl: string;
  budget?: string;
  image?: string;
};

function validCommunitySubmission(value: unknown): value is CommunitySubmission {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return typeof input.reportId === "string" && input.reportId.length <= 128 &&
    typeof input.reportTitle === "string" && input.reportTitle.length <= 255 &&
    typeof input.restaurantName === "string" && input.restaurantName.length > 0 && input.restaurantName.length <= 255 &&
    typeof input.area === "string" && input.area.length > 0 && input.area.length <= 128 &&
    typeof input.memberRating === "number" && input.memberRating >= 4 && input.memberRating <= 5 &&
    typeof input.googleMapsUrl === "string" && /^https:\/\/(maps\.app\.goo\.gl|(?:www\.)?google\.[^/]+\/maps|maps\.google\.)/i.test(input.googleMapsUrl);
}

async function enrichWithPlaces(input: CommunitySubmission, apiKey?: string) {
  if (!apiKey) return input;
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.photos",
      },
      body: JSON.stringify({ textQuery: `${input.restaurantName} ${input.area}`, languageCode: "ja" }),
    });
    if (!response.ok) return input;
    const result = await response.json() as { places?: Array<Record<string, any>> };
    const place = result.places?.[0];
    return place ? { ...input, place } : input;
  } catch {
    return input;
  }
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

    if (pathname === "/api/gourmet-map/community" && ["POST", "PATCH"].includes(request.method)) {
      if (!env.GOURMET_MAP_FEED_URL) return Response.json({ success: false }, { status: 503 });
      try {
        const body = await request.json();
        if (request.method === "POST" && !validCommunitySubmission(body)) {
          return Response.json({ success: false, message: "invalid report" }, { status: 400 });
        }
        if (request.method === "PATCH") {
          const patch = body as Record<string, unknown>;
          if (typeof patch.id !== "string" || typeof patch.published !== "boolean") return Response.json({ success: false }, { status: 400 });
        }
        const payload = request.method === "POST" ? await enrichWithPlaces(body as CommunitySubmission, env.GOOGLE_MAPS_API_KEY) : body;
        const feedResponse = await fetch(env.GOURMET_MAP_FEED_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: request.method === "POST" ? "upsertMealReport" : "setPublished", payload }),
          redirect: "follow",
        });
        if (!feedResponse.ok) throw new Error("feed update failed");
        return new Response(await feedResponse.text(), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      } catch {
        return Response.json({ success: false }, { status: 502 });
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
