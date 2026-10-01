import { Image } from "expo-image";
import { clearApiResponseCaches } from "@/lib/_core/api";
import { clearPaymentCache } from "@/lib/payment-store";
import { clearIrotasPointsCache } from "@/lib/irotas-points-store";
import { clearChatListMemoryCache, clearChatListPersistentCache } from "@/components/chat-list-screen";
import { clearChatMessageCache } from "@/lib/chat-message-cache";
import { clearBoardInstantCache } from "@/lib/board-instant-cache";

/**
 * Removes only rebuildable caches. Authentication, notification preferences,
 * drafts, profile edits, offline submissions and user-created data are kept.
 */
export async function clearSafeApplicationCaches() {
  clearApiResponseCaches();
  clearPaymentCache();
  clearIrotasPointsCache();
  clearChatListMemoryCache();
  clearBoardInstantCache();
  const [memory, disk] = await Promise.allSettled([
    Image.clearMemoryCache(),
    Image.clearDiskCache(),
    clearChatListPersistentCache(),
    clearChatMessageCache(),
  ]);
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("irotas:shared-announcements:v1");
  }
  return {
    imageMemoryCleared: memory.status === "fulfilled",
    imageDiskCleared: disk.status === "fulfilled",
  };
}
