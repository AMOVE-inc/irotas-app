import { eventCategoryFromPrefecture, extractEventLocation, TOKYO_EVENT_AREAS } from "./event-location";

type RestaurantLocationInput = {
  restaurantName: string;
  googleMapsUrl?: string;
  tabelogUrl?: string;
};

type RestaurantLocationResponse = {
  success: boolean;
  formattedAddress?: string;
};

export function mealReportAreaFromAddress(address: string): string {
  const location = extractEventLocation(address);
  if (location.prefecture === "東京都") {
    const area = TOKYO_EVENT_AREAS.find((item) => item.key === location.tokyoArea);
    return `関東｜東京｜${area?.label ?? "その他"}`;
  }
  const category = eventCategoryFromPrefecture(location.prefecture);
  if (category === "kanto") return "関東｜東京以外";
  if (category === "kansai") return "関西";
  return "その他";
}

export async function resolveRestaurantLocation(input: RestaurantLocationInput): Promise<{ area: string; formattedAddress?: string } | null> {
  if (!input.googleMapsUrl?.trim() && !input.tabelogUrl?.trim()) return null;
  try {
    const response = await fetch("/api/restaurant-location", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    const result = await response.json() as RestaurantLocationResponse;
    if (!result.success || !result.formattedAddress) return null;
    return { area: mealReportAreaFromAddress(result.formattedAddress), formattedAddress: result.formattedAddress };
  } catch {
    return null;
  }
}
