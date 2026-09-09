import * as Api from "@/lib/_core/api";
import type { Announcement } from "@/constants/mock-data";

export async function getSharedAnnouncements() {
  const result = await Api.apiCall<{ announcements: Announcement[] }>("/api/announcements");
  return result.announcements;
}

export function saveSharedAnnouncement(announcement: Announcement) {
  return Api.apiCall<{ success: true }>(`/api/announcements/${encodeURIComponent(announcement.id)}`, { method: "PUT", body: JSON.stringify(announcement) });
}

export function deleteSharedAnnouncement(id: string) {
  return Api.apiCall<{ success: true }>(`/api/announcements/${encodeURIComponent(id)}`, { method: "DELETE" });
}
