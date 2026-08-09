import { describe, expect, it } from "vitest";
import { GOURMET_MAP_SEED } from "../constants/gourmet-map-seed";

describe("202608 居酒屋 gourmet map seed", () => {
  it("contains the 307 validated restaurants from the sample CSV", () => {
    expect(GOURMET_MAP_SEED).toHaveLength(307);
    expect(new Set(GOURMET_MAP_SEED.map((restaurant) => restaurant.placeId)).size).toBe(307);
  });

  it("keeps the fields required by the published gourmet map", () => {
    for (const restaurant of GOURMET_MAP_SEED) {
      expect(restaurant.name).toBeTruthy();
      expect(restaurant.address).toBeTruthy();
      expect(restaurant.googleMapsUrl).toMatch(/^https:\/\//);
      expect(restaurant.image).toMatch(/^https:\/\//);
      expect(restaurant.rating).toBeGreaterThan(0);
      expect(restaurant.rating).toBeLessThanOrEqual(5);
      expect(Number.isFinite(restaurant.latitude)).toBe(true);
      expect(Number.isFinite(restaurant.longitude)).toBe(true);
    }
  });
});
