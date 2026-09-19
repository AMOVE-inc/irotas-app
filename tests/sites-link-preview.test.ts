import { afterEach, describe, expect, it, vi } from "vitest";
import { handleLinkPreviewRequest } from "../sites/link-preview";

afterEach(() => vi.unstubAllGlobals());

describe("link preview fetch", () => {
  it("never follows a Tabelog redirect to another host", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 302, headers: { location: "https://example.com/private" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleLinkPreviewRequest(new Request("https://app.example/api/link-preview?url=https%3A%2F%2Ftabelog.com%2Ftokyo%2F"), {});
    expect(await response?.json()).toEqual({ imageUrl: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });
});
