import { describe, expect, it } from "vitest";
import { contentLinkCards } from "../lib/content-link-cards";

describe("content link cards", () => {
  it("shows Tabelog, Google Maps and other HTTPS links as distinct cards", () => {
    const cards = contentLinkCards("https://tabelog.com/tokyo/123/ https://maps.app.goo.gl/abc https://example.com/article。 https://example.com/article");
    expect(cards.map((card) => card.provider)).toEqual(["食べログ", "Google マップ", "example.com"]);
    expect(cards[2].url).toBe("https://example.com/article");
  });

  it("uses a Markdown label and does not duplicate archived previews", () => {
    const cards = contentLinkCards("[おすすめのお店](https://example.com/shop) https://tabelog.com/tokyo/123/", [
      { provider: "食べログ", title: "既存", url: "https://tabelog.com/tokyo/123/" },
    ]);
    expect(cards).toMatchObject([{ provider: "example.com", title: "おすすめのお店" }]);
  });
});
