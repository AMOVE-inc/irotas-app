import type { Member, Restaurant } from "../constants/mock-data";
import { sharedJsonRequest } from "./shared-request";

export type GourmetMapFeedRestaurant = Omit<Restaurant, "registeredBy">;

export type GourmetMapFeed = {
  updatedAt: string;
  sourceFolderId: string;
  files: {
    id: string;
    name: string;
    updatedAt: string;
    category: string;
    rowCount: number;
  }[];
  restaurants: GourmetMapFeedRestaurant[];
  errors: { file: string; row: number; message: string }[];
};

function restaurantKey(restaurant: Pick<Restaurant, "placeId" | "googleMapsUrl" | "name" | "address">) {
  return restaurant.placeId || restaurant.googleMapsUrl || `${restaurant.name}\u0000${restaurant.address}`;
}

export function mergeGourmetMapFeed(
  existing: Restaurant[],
  incoming: GourmetMapFeedRestaurant[],
  registeredBy: Member,
): Restaurant[] {
  const merged = new Map(existing.map((restaurant) => [restaurantKey(restaurant), restaurant]));
  incoming.forEach((restaurant) => {
    const previous = merged.get(restaurantKey(restaurant));
    const next: Restaurant = {
      ...previous,
      ...restaurant,
      description: restaurant.description || previous?.description,
      memberComment: restaurant.memberComment || previous?.memberComment,
      registeredBy,
    };
    merged.set(restaurantKey(next), next);
  });
  return [...merged.values()];
}

export async function fetchGourmetMapFeed(): Promise<GourmetMapFeed | null> {
  try {
    const feed = await sharedJsonRequest<GourmetMapFeed>("/api/gourmet-map/feed", { cache: "no-store" });
    return Array.isArray(feed.restaurants) ? feed : null;
  } catch {
    return null;
  }
}
