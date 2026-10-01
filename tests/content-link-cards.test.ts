import { describe, expect, it } from "vitest";
import { contentLinkCards } from "../lib/content-link-cards";

describe("content link cards", () => {
  it("shows Tabelog, Google Maps and other HTTPS links as distinct cards", () => {
    const cards = contentLinkCards("https://tabelog.com/tokyo/123/ https://maps.app.goo.gl/abc https://example.com/article。 https://example.com/article");
    expect(cards.map((card) => card.provider)).toEqual(["食べログ", "Google マップ", "example.com"]);
    expect(cards[2].url).toBe("https://example.com/article");
  });

  it("does not create preview cards for IRO+ app links", () => {
    const cards = contentLinkCards("アプリ内 https://app.irotas-community.com/board?category=free-chat 外部 https://example.com/shop");
    expect(cards.map((card) => card.url)).toEqual(["https://example.com/shop"]);
  });

  it("uses a Markdown label and does not duplicate archived previews", () => {
    const cards = contentLinkCards("[おすすめのお店](https://example.com/shop) https://tabelog.com/tokyo/123/", [
      { provider: "食べログ", title: "既存", url: "https://tabelog.com/tokyo/123/" },
    ]);
    expect(cards).toMatchObject([{ provider: "example.com", title: "おすすめのお店" }]);
  });

  it("uses a nearby restaurant name for a Tabelog link when no page metadata is available", () => {
    const cards = contentLinkCards("Bistro yen 050-3595-0835 東京都中央区日本橋蛎殻町6-7\nhttps://tabelog.com/tokyo/A1302/A130203/13279853/");
    expect(cards[0].title).toBe("Bistro yen");
    expect(cards[0].imageUrl).toMatch(/^https:\/\/tblg\.k-img\.com\//);
  });

  it("shows the known restaurant name for a bare Tabelog link in chat", () => {
    const cards = contentLinkCards("https://tabelog.com/tokyo/A1302/A130202/13284333/?ref=chat");
    expect(cards[0]).toMatchObject({ title: "Fruits Bistro SABLIER", provider: "食べログ" });
    expect(cards[0].imageUrl).toMatch(/^https:\/\/tblg\.k-img\.com\//);
  });

  it("uses a separate restaurant name for each link in a list", () => {
    const cards = contentLinkCards("魚三酒場 富岡店\n03-3641-8071\n東京都江東区富岡1-5-4\nhttps://tabelog.com/tokyo/A1313/A131303/13003007/\n\nトラットリア ブカ マッシモ\n03-5809-9022\n東京都江東区富岡1-24-11\nhttps://tabelog.com/tokyo/A1313/A131303/13194455/");
    expect(cards.map((card) => card.title)).toEqual(["魚三酒場 富岡店", "トラットリア ブカ マッシモ"]);
  });
});
