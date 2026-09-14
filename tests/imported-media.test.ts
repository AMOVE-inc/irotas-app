import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequestMember } from "../sites/auth";
import { handleImportedMediaRequest } from "../sites/imported-media";
import type { SitesEnv } from "../sites/platform-types";

vi.mock("../sites/auth", () => ({ authenticatedRequestMember: vi.fn() }));

const path = "/discord-board/1485587497374453870/1543577576453181571.webp";
const url = `https://app.irotas-community.com${path}`;

describe("private Discord media", () => {
  beforeEach(() => {
    vi.mocked(authenticatedRequestMember).mockReset();
  });

  it.each(["GET", "HEAD"])("denies anonymous %s before reading storage", async (method) => {
    const get = vi.fn();
    const env = { UPLOADS: { get } } as unknown as SitesEnv;
    vi.mocked(authenticatedRequestMember).mockResolvedValue(null);
    const response = await handleImportedMediaRequest(new Request(url, { method }), env);
    expect(response?.status).toBe(401);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(get).not.toHaveBeenCalled();
  });

  it("serves private storage to signed-in members", async () => {
    vi.mocked(authenticatedRequestMember).mockResolvedValue({ id: 1 } as never);
    const env = {
      UPLOADS: { get: async () => ({ body: new Uint8Array([1, 2, 3]), httpMetadata: { contentType: "image/webp" } }) },
    } as unknown as SitesEnv;
    const response = await handleImportedMediaRequest(new Request(url), env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect([...new Uint8Array(await response!.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it("never falls back to a packaged public asset", async () => {
    vi.mocked(authenticatedRequestMember).mockResolvedValue({ id: 1 } as never);
    const fetch = vi.fn();
    const env = { UPLOADS: { get: async () => null }, ASSETS: { fetch } } as unknown as SitesEnv;
    const response = await handleImportedMediaRequest(new Request(url), env);
    expect(response?.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
