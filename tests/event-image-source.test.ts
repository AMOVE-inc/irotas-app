import { describe, expect, it } from "vitest";
import { getEventImageQuery, getEventPreviewUrl, hasEventImageSource } from "../lib/event-image-source";

describe("event image sources", () => {
  it("uses the linked restaurant or map page as the preview source", () => {
    const event = { image: "", tabelogUrl: "https://tabelog.com/example", googleMapsUrl: "", title: "寿司会", restaurantName: "鮨テスト", location: "銀座" };
    expect(getEventPreviewUrl(event)).toBe("https://tabelog.com/example");
    expect(hasEventImageSource(event)).toBe(true);
    expect(getEventImageQuery(event)).toBe("鮨テスト 寿司会 銀座");
  });
  it("does not mark an event without an image or source page as previewable", () => {
    expect(hasEventImageSource({ image: "", tabelogUrl: "", googleMapsUrl: "", title: "イベント", location: "東京" })).toBe(false);
  });
});
