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
});
