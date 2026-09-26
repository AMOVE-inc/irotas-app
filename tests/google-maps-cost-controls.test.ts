import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync("app/gourmet-map.tsx", "utf8");
const worker = readFileSync("sites/worker.ts", "utf8");
const migration = readFileSync("drizzle/0062_google_maps_api_usage.sql", "utf8");

describe("Google Maps photo cost controls", () => {
  it("requests Google photos only from the restaurant detail view", () => {
    expect(screen.match(/<RestaurantPhoto[^>]*allowGooglePhoto/g)).toHaveLength(1);
    expect(screen).toContain("const canRequestGooglePhoto = allowGooglePhoto");
    expect(screen).toContain("cachePolicy={canRequestGooglePhoto ? \"none\" : \"disk\"}");
  });

  it("protects the paid endpoint and supports an emergency kill switch", () => {
    const route = worker.slice(worker.indexOf('pathname === "/api/gourmet-map/photo"'));
    expect(route).toContain("protectedWhenAuthEnabled(request, env)");
    expect(route).toContain('env.GOOGLE_MAPS_PHOTOS_ENABLED === "false"');
    expect(route).toContain('reserveGoogleMapsRequest(env, "photo")');
    expect(route).toContain('"cache-control": "private, no-store"');
  });

  it("enforces the configured monthly limit with an atomic D1 counter", () => {
    const controls = readFileSync("sites/google-maps-cost-control.ts", "utf8");
    expect(controls).toContain('GOOGLE_MAPS_PHOTO_MONTHLY_LIMIT ?? "5000"');
    expect(controls).toContain('GOOGLE_MAPS_SEARCH_MONTHLY_LIMIT ?? "1000"');
    expect(controls).toContain("WHERE google_maps_api_usage.request_count < ?");
    expect(controls).toContain("RETURNING request_count");
    expect(migration).toContain("PRIMARY KEY");
  });

  it("uses IRO+ data before paid concierge search and avoids Places link previews", () => {
    const concierge = readFileSync("sites/concierge.ts", "utf8");
    const linkPreview = readFileSync("sites/link-preview.ts", "utf8");
    expect(concierge.indexOf("await feedPlaces")).toBeLessThan(concierge.indexOf('reserveGoogleMapsRequest(env, "search")'));
    expect(linkPreview).not.toContain("places.googleapis.com");
  });
});
