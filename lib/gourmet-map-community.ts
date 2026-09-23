import type { BoardThread } from "../constants/mock-data";
import { sharedJsonRequest } from "./shared-request";

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
    image: thread.images?.find((value): value is string => typeof value === "string" && /^https:\/\//.test(value)),
  };
}

export async function registerCommunityRestaurant(submission: CommunityRestaurantSubmission) {
  return sharedJsonRequest<{ success: true; duplicate: boolean }>("/api/gourmet-map/community", {
    method: "POST",
    body: JSON.stringify(submission),
  }, "グルメマップへ登録できませんでした");
}

export async function setCommunityRestaurantPublished(id: string, published: boolean) {
  await sharedJsonRequest<{ success: true }>("/api/gourmet-map/community", {
    method: "PATCH",
    body: JSON.stringify({ id, published }),
  }, "掲載状態を変更できませんでした");
}
