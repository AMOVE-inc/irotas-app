import { describe, expect, it } from "vitest";
import { restaurantsForConciergeQuery } from "../lib/concierge-restaurants";

describe("gourmet concierge restaurant constraints", () => {
  it("does not return another area or genre for a strict request", () => {
    expect(restaurantsForConciergeQuery("目黒でおすすめの居酒屋")).toEqual([]);
    expect(restaurantsForConciergeQuery("渋谷でおすすめの焼肉").map((restaurant) => restaurant.id)).toEqual(["r1"]);
  });

  it("recognizes izakaya as a cuisine constraint", () => {
    expect(restaurantsForConciergeQuery("横浜の居酒屋").map((restaurant) => restaurant.id)).toEqual(["r4"]);
  });
});
