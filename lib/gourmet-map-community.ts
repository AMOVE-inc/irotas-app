import type { BoardThread } from "../constants/mock-data";

export type CommunityRestaurantSubmission = {
  reportId: string;
  reportTitle: string;
  restaurantName: string;
  area: string;
  memberRating: number;
  googleMapsUrl: string;
  budget?: string;
  image?: string;
};

export function communityRestaurantFromMealReport(
  thread: BoardThread,
): CommunityRestaurantSubmission | null {
  const report = thread.mealReport;
  if (!report || report.rating < 4 || !report.googleMapUrl) return null;
  return {
    reportId: thread.id,
    reportTitle: thread.title,
    restaurantName: report.restaurantName,
    area: report.prefecture,
    memberRating: report.rating,
    googleMapsUrl: report.googleMapUrl,
    budget: report.budget,
    image: thread.images?.find((value) => /^https:\/\//.test(value)),
  };
}

export async function registerCommunityRestaurant(submission: CommunityRestaurantSubmission) {
  const response = await fetch("/api/gourmet-map/community", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(submission),
  });
  if (!response.ok) throw new Error("グルメマップへ登録できませんでした");
  return response.json() as Promise<{ success: true; duplicate: boolean }>;
}

export async function setCommunityRestaurantPublished(id: string, published: boolean) {
  const response = await fetch("/api/gourmet-map/community", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, published }),
  });
  if (!response.ok) throw new Error("掲載状態を変更できませんでした");
}
