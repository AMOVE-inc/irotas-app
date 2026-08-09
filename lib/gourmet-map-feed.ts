import type { Member, Restaurant } from "../constants/mock-data";

export type GourmetMapFeedRestaurant = Omit<Restaurant, "registeredBy">;

export type GourmetMapFeed = {
  updatedAt: string;
  sourceFolderId: string;
  files: Array<{
    id: string;
    name: string;
    updatedAt: string;
    category: string;
    rowCount: number;
  }>;
  restaurants: GourmetMapFeedRestaurant[];
  errors: Array<{ file: string; row: number; message: string }>;
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
    const next: Restaurant = { ...restaurant, registeredBy };
    merged.set(restaurantKey(next), next);
  });
  return [...merged.values()];
}

export async function fetchGourmetMapFeed(): Promise<GourmetMapFeed | null> {
  const response = await fetch("/api/gourmet-map/feed", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const feed = (await response.json()) as GourmetMapFeed;
  return Array.isArray(feed.restaurants) ? feed : null;
}
