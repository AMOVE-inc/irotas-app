import { describe, expect, it, vi } from "vitest";
import { handleImportedMediaRequest } from "../sites/imported-media";
import type { SitesEnv } from "../sites/platform-types";

vi.mock("../sites/auth", () => ({ authenticatedRequestMember: vi.fn(async () => ({ id: 1, role: "user", access_role: "member", account_status: "active" })) }));

describe("Discord media migration", () => {
  it("serves packaged archived photos to signed-in members when private storage is empty", async () => {
    const env = {
      ASSETS: { fetch: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } }) },
      UPLOADS: { get: async () => null },
    } as unknown as SitesEnv;
    const response = await handleImportedMediaRequest(new Request("https://app.irotas-community.com/discord-board/1485587497374453870/1543577576453181571.webp"), env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("image/webp");
  });
  it("requires a temporary secret and copies only named media into private storage", async () => {
    const saved: { key: string; contentType?: string; bytes: number[] }[] = [];
    const env = {
      MEDIA_MIGRATION_TOKEN: "test-secret",
      ASSETS: { fetch: async () => new Response(new Uint8Array([1, 2, 3])) },
      UPLOADS: {
        put: async (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) => {
          saved.push({ key, contentType: options?.httpMetadata?.contentType, bytes: [...new Uint8Array(value)] });
        },
      },
    } as unknown as SitesEnv;
    const url = "https://app.irotas-community.com/api/admin/discord-media-migration";
    const path = "/discord-benefits/coupon-0.webp";
    const denied = await handleImportedMediaRequest(new Request(url, { method: "POST", body: JSON.stringify({ paths: [path] }) }), env);
    expect(denied?.status).toBe(404);
    const response = await handleImportedMediaRequest(new Request(url, {
      method: "POST", headers: { "x-migration-token": "test-secret" }, body: JSON.stringify({ paths: [path] }),
    }), env);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ uploaded: [path], failed: [] });
    expect(saved).toEqual([{ key: "private-migration-media/discord-benefits/coupon-0.webp", contentType: "image/webp", bytes: [1, 2, 3] }]);
    const traversal = await handleImportedMediaRequest(new Request(url, {
      method: "POST", headers: { "x-migration-token": "test-secret" }, body: JSON.stringify({ paths: ["/discord-benefits/../secret.webp"] }),
    }), env);
    expect(traversal?.status).toBe(400);
  });
});
