import { describe, expect, it, vi } from "vitest";
import { handleEventRequest } from "../sites/events";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

const { authenticatedRequestMember } = vi.hoisted(() => ({ authenticatedRequestMember: vi.fn() }));
vi.mock("../sites/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sites/auth")>()), authenticatedRequestMember,
}));

const db: D1Database = {
  prepare() {
    const statement: D1PreparedStatement = {
      bind() { return statement; },
      async first<T>() { return { public_member_id: "IRO0017" } as T; },
      async all<T>() { return { results: [] as T[] }; },
      async run() { return { success: true }; },
    };
    return statement;
  },
  async batch() { return []; },
};

describe("private chat video delivery", () => {
  it("accepts a member's MP4 attachment and keeps it in private storage", async () => {
    authenticatedRequestMember.mockResolvedValue({ id: 17, role: "user", access_role: "member", account_status: "active" });
    const put = vi.fn(async (_key: string, _bytes: ArrayBuffer, _options?: unknown) => ({}));
    const response = await handleEventRequest(new Request("https://app.example/api/event-images", {
      method: "POST", headers: { "content-type": "video/mp4" }, body: new Uint8Array([0, 1, 2, 3]),
    }), { DB: db, UPLOADS: { put } } as unknown as SitesEnv);
    expect(response?.status).toBe(201);
    expect(await response?.json()).toMatchObject({ imageUrl: expect.stringMatching(/^\/api\/event-images\//) });
    expect(put.mock.calls[0]?.[0]).toMatch(/^events\/17\/.+\.mp4$/);
  });

  it("serves authenticated byte ranges for video playback", async () => {
    authenticatedRequestMember.mockResolvedValue({ id: 17, role: "user", access_role: "member", account_status: "active" });
    const get = vi.fn(async () => ({
      body: new Blob(["abcd"]).stream(), size: 8, range: { offset: 0, length: 4 },
      httpMetadata: { contentType: "video/mp4" },
    }));
    const response = await handleEventRequest(new Request("https://app.example/api/event-images/events%2F17%2Fclip.mp4", { headers: { range: "bytes=0-3" } }), {
      DB: db, UPLOADS: { get },
    } as unknown as SitesEnv);
    expect(response?.status).toBe(206);
    expect(response?.headers.get("content-range")).toBe("bytes 0-3/8");
    expect(response?.headers.get("content-type")).toBe("video/mp4");
    expect(response?.headers.get("cache-control")).toContain("private");
    expect(get.mock.calls).toHaveLength(1);
  });
});
