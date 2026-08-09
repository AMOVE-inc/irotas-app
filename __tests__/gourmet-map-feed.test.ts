import { describe, expect, it } from "vitest";
import { CURRENT_USER, type Restaurant } from "../constants/mock-data";
import { mergeGourmetMapFeed } from "../lib/gourmet-map-feed";

const restaurant = (overrides: Partial<Restaurant> = {}): Restaurant => ({
  id: "gm_place-1",
  placeId: "place-1",
  name: "テスト居酒屋",
  genre: "居酒屋",
  sourceCategories: ["居酒屋"],
  address: "東京都渋谷区",
  latitude: 35.6,
  longitude: 139.7,
  rating: 4.1,
  reviewCount: 10,
  image: "https://example.com/image.jpg",
  registeredBy: CURRENT_USER,
  googleMapsUrl: "https://maps.google.com/example",
  sourceList: "居酒屋",
  importedAt: "2026-08-01T00:00:00+09:00",
  ...overrides,
});

describe("mergeGourmetMapFeed", () => {
  it("Place IDが同じ店舗を最新フィードで更新する", () => {
    const existing = restaurant();
    const incoming = { ...restaurant({ rating: 4.8, reviewCount: 99 }), registeredBy: undefined };
    const { registeredBy: _ignored, ...feedRestaurant } = incoming;
    const result = mergeGourmetMapFeed([existing], [feedRestaurant], CURRENT_USER);
    expect(result).toHaveLength(1);
    expect(result[0].rating).toBe(4.8);
    expect(result[0].reviewCount).toBe(99);
  });

  it("新しいPlace IDを追加する", () => {
    const incoming = restaurant({ id: "gm_place-2", placeId: "place-2", name: "新しい店" });
    const { registeredBy: _ignored, ...feedRestaurant } = incoming;
    const result = mergeGourmetMapFeed([restaurant()], [feedRestaurant], CURRENT_USER);
    expect(result).toHaveLength(2);
  });
});
