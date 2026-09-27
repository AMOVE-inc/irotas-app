import { Image } from "expo-image";
import { clearApiResponseCaches } from "@/lib/_core/api";
import { clearPaymentCache } from "@/lib/payment-store";
import { clearIrotasPointsCache } from "@/lib/irotas-points-store";
import { clearChatListMemoryCache } from "@/components/chat-list-screen";

/**
 * Removes only rebuildable caches. Authentication, notification preferences,
 * drafts, profile edits, offline submissions and user-created data are kept.
 */
export async function clearSafeApplicationCaches() {
  clearApiResponseCaches();
  clearPaymentCache();
  clearIrotasPointsCache();
  clearChatListMemoryCache();
  const [memory, disk] = await Promise.allSettled([
    Image.clearMemoryCache(),
    Image.clearDiskCache(),
  ]);
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("irotas:shared-announcements:v1");
  }
  return {
    imageMemoryCleared: memory.status === "fulfilled",
    imageDiskCleared: disk.status === "fulfilled",
  };
}
