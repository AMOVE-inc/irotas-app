import { useAuthContext } from "@/lib/auth-context";
import * as Api from "@/lib/_core/api";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Shows notifications arriving while the app is open, without surfacing old unread items on startup. */
export function LiveNotificationBanner() {
  const { isAuthenticated, user } = useAuthContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [latest, setLatest] = useState<Api.AppNotification | null>(null);
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { seenIds.current = null; setLatest(null); return; }
    let active = true;
    let pending = false;
    seenIds.current = null;
    const refresh = async () => {
      if (pending || (Platform.OS === "web" && document.visibilityState === "hidden")) return;
      pending = true;
      try {
        const items = await Api.getNotifications();
        if (!active) return;
        const previous = seenIds.current;
        if (previous) {
          const incoming = items.find((item) => !item.read && !previous.has(item.id));
          if (incoming) setLatest(incoming);
        }
        seenIds.current = new Set(items.map((item) => item.id));
      } catch {
        // Keep the previous baseline and retry when connectivity returns.
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!latest) return;
    const timer = setTimeout(() => setLatest(null), 5000);
    return () => clearTimeout(timer);
  }, [latest]);

  if (!latest) return null;
  return (
    <View style={{ position: "absolute", top: Math.max(insets.top, 8) + 8, left: 16, right: 16, zIndex: 1000, elevation: 30, alignItems: "center" }} pointerEvents="box-none">
      <Pressable
        onPress={() => {
          const path = latest.targetPath;
          setLatest(null);
          void Api.markNotificationRead(latest.id).catch(() => {});
          router.push(path?.startsWith("/board?") || path?.startsWith("/chat?") || path?.startsWith("/event-detail?") ? path as any : "/notifications");
        }}
        accessibilityRole="button"
        accessibilityLabel={`${latest.title}。通知を開く`}
        style={{ width: "100%", maxWidth: 500, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8A0BF", shadowColor: "#3D2635", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } }}
      >
        <Text style={{ fontSize: 14, fontWeight: "800", color: "#17171C" }} numberOfLines={1}>{latest.title}</Text>
        <Text style={{ marginTop: 3, fontSize: 13, color: "#62636C" }} numberOfLines={2}>{latest.body}</Text>
      </Pressable>
    </View>
  );
}
