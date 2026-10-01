import { afterEach, describe, expect, it, vi } from "vitest";
import { handleLinkPreviewRequest, pagePreviewMetadata } from "../sites/link-preview";

afterEach(() => vi.unstubAllGlobals());

describe("link preview fetch", () => {
  it("never follows a Tabelog redirect to another host", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 302, headers: { location: "https://example.com/private" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleLinkPreviewRequest(new Request("https://app.example/api/link-preview?url=https%3A%2F%2Ftabelog.com%2Ftokyo%2F"), {});
    expect(await response?.json()).toEqual({ title: null, description: null, imageUrl: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("uses a Tabelog page's title, description, and photo", async () => {
    const html = '<meta property="og:title" content="Henderson (神泉/ビストロ)"><meta property="og:image" content="https://tblg.k-img.com/photo.jpg?token=abc&amp;api=v2"><meta property="og:description" content="★★★☆☆3.52 ■予算(夜):￥6,000～￥7,999">';
    expect(pagePreviewMetadata(html, "https://tabelog.com/tokyo/A1303/A130301/13296149/")).toEqual({
      title: "Henderson (神泉/ビストロ)",
      description: "★★★☆☆3.52 ■予算(夜):￥6,000～￥7,999",
      imageUrl: "https://tblg.k-img.com/photo.jpg?token=abc&api=v2",
    });
  });

  it("returns the restaurant metadata to a link card", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('<meta property="og:title" content="Henderson (神泉/ビストロ)"><meta property="og:image" content="https://tblg.k-img.com/henderson.jpg">', { headers: { "content-type": "text/html; charset=utf-8" } })));
    const response = await handleLinkPreviewRequest(new Request("https://app.example/api/link-preview?url=https%3A%2F%2Ftabelog.com%2Ftokyo%2FA1303%2FA130301%2F13296149%2F"), {});
    expect(await response?.json()).toEqual({ title: "Henderson (神泉/ビストロ)", description: null, imageUrl: "https://tblg.k-img.com/henderson.jpg" });
  });

  it("returns Open Graph metadata and an image for a general external HTTPS page", async () => {
    const fetchMock = vi.fn(async () => new Response('<meta property="og:title" content="おすすめ店"><meta property="og:image" content="/images/shop.jpg"><meta property="og:description" content="店舗の紹介">', { headers: { "content-type": "text/html; charset=utf-8" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleLinkPreviewRequest(new Request("https://app.example/api/link-preview?url=https%3A%2F%2Frestaurant.example.com%2Fshop"), {});
    expect(await response?.json()).toEqual({ title: "おすすめ店", description: "店舗の紹介", imageUrl: "https://restaurant.example.com/images/shop.jpg" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not fetch IRO+ app links", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleLinkPreviewRequest(new Request("https://app.example/api/link-preview?url=https%3A%2F%2Fapp.irotas-community.com%2Fboard%3Fcategory%3Dfree-chat"), {});
    expect(await response?.json()).toEqual({ title: null, description: null, imageUrl: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a known restaurant name when Tabelog blocks metadata requests", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    const response = await handleLinkPreviewRequest(new Request("https://app.example/api/link-preview?url=https%3A%2F%2Ftabelog.com%2Ftokyo%2FA1302%2FA130202%2F13284333%2F"), {});
    expect(await response?.json()).toMatchObject({ title: "Fruits Bistro SABLIER" });
  });
});
