import type { BoardThread } from "../constants/mock-data";
import { sharedJsonRequest } from "./shared-request";

export type CommunityRestaurantSubmission = {
  reportId: string;
  reportTitle: string;
  restaurantName: string;
  area: string;
  memberRating: number;
  memberComment?: string;
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

export type GourmetMapCandidate = {
  id: string;
  source_thread_id: string;
  report_title: string;
  restaurant_name: string;
  area: string;
  member_rating: number;
  member_comment: string;
  google_maps_url: string;
  image_url?: string | null;
  status: "pending" | "published" | "rejected" | "ineligible";
  created_at: string;
};

export async function fetchGourmetMapCandidates() {
  const result = await sharedJsonRequest<{ candidates: GourmetMapCandidate[] }>("/api/gourmet-map/candidates", { cache: "no-store" });
  return result.candidates;
}

export async function reviewGourmetMapCandidate(id: string, action: "approve" | "reject") {
  await sharedJsonRequest<{ success: true }>(`/api/gourmet-map/candidates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  }, action === "approve" ? "店舗を公開できませんでした" : "候補を却下できませんでした");
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
