import { describe, expect, it } from "vitest";
import worker from "../sites/worker";
import type { SitesEnv } from "../sites/platform-types";

function environment(options?: { database?: boolean; uploads?: boolean }) {
  const database = options?.database ?? true;
  const uploads = options?.uploads ?? true;
  return {
    ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
    DB: database
      ? {
          prepare: () => ({
            bind: () => ({ first: async () => ({ value: "1" }) }),
            first: async () => ({ value: "1" }),
          }),
        }
      : undefined,
    UPLOADS: uploads ? { list: async () => ({ objects: [] }) } : undefined,
  } as unknown as SitesEnv;
}

describe("platform health endpoint", () => {
  it("requires membership before serving imported Discord media", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/discord-board/1485649683345969182/1503041419307126977.webp"),
      environment({ database: false }),
    );
    expect(response.status).toBe(401);
  });
  it("reports healthy when database and uploads are connected", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/platform/health"),
      environment(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      services: { database: "ok", uploads: "ok" },
      schemaVersion: "1",
    });
    expect(response.headers.get("strict-transport-security")).toContain("max-age=");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("reports degraded without a storage binding", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/platform/health"),
      environment({ uploads: false }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "degraded",
      services: { database: "ok", uploads: "unavailable" },
    });
  });

  it("blocks cross-origin mutation requests before processing personal data", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/restaurant-location", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      environment(),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
