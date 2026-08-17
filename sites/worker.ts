interface SitesEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  DB?: {
    prepare(query: string): {
      bind(...values: unknown[]): {
        first(): Promise<Record<string, unknown> | null>;
      };
      first(): Promise<Record<string, unknown> | null>;
    };
  };
  UPLOADS?: {
    list(options?: { limit?: number }): Promise<unknown>;
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

function validCommunitySubmission(
  value: unknown,
): value is CommunitySubmission {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.reportId === "string" &&
    input.reportId.length <= 128 &&
    typeof input.reportTitle === "string" &&
    input.reportTitle.length <= 255 &&
    typeof input.restaurantName === "string" &&
    input.restaurantName.length > 0 &&
    input.restaurantName.length <= 255 &&
    typeof input.area === "string" &&
    input.area.length > 0 &&
    input.area.length <= 128 &&
    typeof input.memberRating === "number" &&
    input.memberRating >= 4 &&
    input.memberRating <= 5 &&
    typeof input.googleMapsUrl === "string" &&
    /^https:\/\/(maps\.app\.goo\.gl|(?:www\.)?google\.[^/]+\/maps|maps\.google\.)/i.test(
      input.googleMapsUrl,
    )
  );
}

async function enrichWithPlaces(input: CommunitySubmission, apiKey?: string) {
  if (!apiKey) return input;
  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
          "x-goog-fieldmask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.photos",
        },
        body: JSON.stringify({
          textQuery: `${input.restaurantName} ${input.area}`,
          languageCode: "ja",
        }),
      },
    );
    if (!response.ok) return input;
    const result = (await response.json()) as {
      places?: Array<Record<string, any>>;
    };
    const place = result.places?.[0];
    return place ? { ...input, place } : input;
  } catch {
    return input;
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\\u([0-9a-f]{4})/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}

async function locationHintFromUrl(rawUrl?: string) {
  if (!rawUrl) return "";
  try {
    let current = new URL(rawUrl);
    if (current.hostname === "maps.app.goo.gl") {
      for (let index = 0; index < 5; index += 1) {
        const response = await fetch(current.toString(), {
          redirect: "manual",
        });
        const location = response.headers.get("location");
        if (!location) break;
        current = new URL(location, current);
      }
    }
    if (current.hostname.includes("tabelog.com")) {
      const response = await fetch(current.toString(), {
        headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
      });
      if (response.ok) {
        const html = await response.text();
        const address = html.match(/"streetAddress"\s*:\s*"([^"]+)"/i)?.[1];
        const title = html.match(
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
        )?.[1];
        return decodeHtml(`${title ?? ""} ${address ?? ""}`.trim()).slice(
          0,
          500,
        );
      }
    }
    return decodeURIComponent(
      `${current.searchParams.get("query") ?? ""} ${current.pathname.replace(/\+/g, " ")}`,
    ).slice(0, 500);
  } catch {
    return "";
  }
}

async function resolveRestaurantAddress(
  input: Record<string, unknown>,
  apiKey?: string,
) {
  const restaurantName =
    typeof input.restaurantName === "string"
      ? input.restaurantName.trim().slice(0, 255)
      : "";
  const googleMapsUrl =
    typeof input.googleMapsUrl === "string" ? input.googleMapsUrl.trim() : "";
  const tabelogUrl =
    typeof input.tabelogUrl === "string" ? input.tabelogUrl.trim() : "";
  if (!restaurantName || (!googleMapsUrl && !tabelogUrl) || !apiKey)
    return null;
  const hint = await locationHintFromUrl(googleMapsUrl || tabelogUrl);
  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask":
          "places.displayName,places.formattedAddress,places.googleMapsUri",
      },
      body: JSON.stringify({
        textQuery: `${restaurantName} ${hint}`.trim(),
        languageCode: "ja",
        regionCode: "JP",
        maxResultCount: 1,
      }),
    },
  );
  if (!response.ok) return null;
  const result = (await response.json()) as {
    places?: Array<{
      formattedAddress?: string;
      displayName?: { text?: string };
      googleMapsUri?: string;
    }>;
  };
  return result.places?.[0] ?? null;
}

function assetRequest(request: Request, pathname: string) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

export default {
  async fetch(request: Request, env: SitesEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/platform/health" && request.method === "GET") {
      const startedAt = Date.now();
      let database: "ok" | "unavailable" = "unavailable";
      let uploads: "ok" | "unavailable" = "unavailable";
      let schemaVersion: string | null = null;

      try {
        if (env.DB) {
          const row = await env.DB.prepare(
            "SELECT value FROM system_metadata WHERE key = ?",
          )
            .bind("platform_schema_version")
            .first();
          schemaVersion = typeof row?.value === "string" ? row.value : null;
          database = schemaVersion ? "ok" : "unavailable";
        }
      } catch {
        database = "unavailable";
      }

      try {
        if (env.UPLOADS) {
          await env.UPLOADS.list({ limit: 1 });
          uploads = "ok";
        }
      } catch {
        uploads = "unavailable";
      }

      const healthy = database === "ok" && uploads === "ok";
      return Response.json(
        {
          status: healthy ? "ok" : "degraded",
          services: { database, uploads },
          schemaVersion,
          elapsedMs: Date.now() - startedAt,
        },
        {
          status: healthy ? 200 : 503,
          headers: { "cache-control": "no-store" },
        },
      );
    }

    if (pathname === "/api/gourmet-map/feed" && request.method === "GET") {
      if (!env.GOURMET_MAP_FEED_URL) {
        return Response.json(
          { configured: false, restaurants: [] },
          { status: 503 },
        );
      }
      try {
        const feedResponse = await fetch(env.GOURMET_MAP_FEED_URL, {
          headers: { accept: "application/json" },
          redirect: "follow",
        });
        if (!feedResponse.ok)
          throw new Error(`Feed returned ${feedResponse.status}`);
        return new Response(await feedResponse.text(), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      } catch {
        return Response.json(
          { configured: true, restaurants: [] },
          { status: 502 },
        );
      }
    }

    if (pathname === "/api/restaurant-location" && request.method === "POST") {
      try {
        const input = (await request.json()) as Record<string, unknown>;
        const place = await resolveRestaurantAddress(
          input,
          env.GOOGLE_MAPS_API_KEY,
        );
        if (!place?.formattedAddress)
          return Response.json({ success: false }, { status: 404 });
        return Response.json(
          {
            success: true,
            formattedAddress: place.formattedAddress,
            name: place.displayName?.text,
            googleMapsUrl: place.googleMapsUri,
          },
          { headers: { "cache-control": "no-store" } },
        );
      } catch {
        return Response.json({ success: false }, { status: 400 });
      }
    }

    if (
      pathname === "/api/gourmet-map/community" &&
      ["POST", "PATCH"].includes(request.method)
    ) {
      if (!env.GOURMET_MAP_FEED_URL)
        return Response.json({ success: false }, { status: 503 });
      try {
        const body = await request.json();
        if (request.method === "POST" && !validCommunitySubmission(body)) {
          return Response.json(
            { success: false, message: "invalid report" },
            { status: 400 },
          );
        }
        if (request.method === "PATCH") {
          const patch = body as Record<string, unknown>;
          if (
            typeof patch.id !== "string" ||
            typeof patch.published !== "boolean"
          )
            return Response.json({ success: false }, { status: 400 });
        }
        const payload =
          request.method === "POST"
            ? await enrichWithPlaces(
                body as CommunitySubmission,
                env.GOOGLE_MAPS_API_KEY,
              )
            : body;
        const feedResponse = await fetch(env.GOURMET_MAP_FEED_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action:
              request.method === "POST" ? "upsertMealReport" : "setPublished",
            payload,
          }),
          redirect: "follow",
        });
        if (!feedResponse.ok) throw new Error("feed update failed");
        return new Response(await feedResponse.text(), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      } catch {
        return Response.json({ success: false }, { status: 502 });
      }
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    if (!pathname.split("/").at(-1)?.includes(".")) {
      const routePath =
        pathname === "/"
          ? "/index.html"
          : `${pathname.replace(/\/$/, "")}.html`;
      const routeResponse = await env.ASSETS.fetch(
        assetRequest(request, routePath),
      );
      if (routeResponse.status !== 404) return routeResponse;
    }

    return env.ASSETS.fetch(assetRequest(request, "/+not-found.html"));
  },
};
