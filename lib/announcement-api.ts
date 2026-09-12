import * as Api from "@/lib/_core/api";
import type { Announcement } from "@/constants/mock-data";

const ANNOUNCEMENT_CACHE_KEY = "irotas:shared-announcements:v1";

/** A last-known-good display snapshot; the API remains the source of truth. */
export function getCachedSharedAnnouncements(): Announcement[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const value: unknown = JSON.parse(localStorage.getItem(ANNOUNCEMENT_CACHE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is Announcement =>
      typeof item === "object" && item !== null && typeof item.id === "string" && typeof item.title === "string" && typeof item.content === "string") : [];
  } catch { return []; }
}

function cacheAnnouncements(announcements: Announcement[]) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(ANNOUNCEMENT_CACHE_KEY, JSON.stringify(announcements)); } catch {}
}

export async function getSharedAnnouncements() {
  const result = await Api.apiCall<{ announcements: Announcement[] }>("/api/announcements");
  cacheAnnouncements(result.announcements);
  return result.announcements;
}

export async function saveSharedAnnouncement(announcement: Announcement) {
  const result = await Api.apiCall<{ success: true }>(`/api/announcements/${encodeURIComponent(announcement.id)}`, { method: "PUT", body: JSON.stringify(announcement) });
  cacheAnnouncements([announcement, ...getCachedSharedAnnouncements().filter((item) => item.id !== announcement.id)]);
  return result;
}

export async function deleteSharedAnnouncement(id: string) {
  const result = await Api.apiCall<{ success: true }>(`/api/announcements/${encodeURIComponent(id)}`, { method: "DELETE" });
  cacheAnnouncements(getCachedSharedAnnouncements().filter((item) => item.id !== id));
  return result;
}
