import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform, useWindowDimensions } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import * as Api from "@/lib/_core/api";
import { effectiveUnreadTotal, subscribeToOptimisticChatReads } from "@/lib/chat-unread-sync";
import { useEffect, useRef, useState } from "react";
import { BOTTOM_NAV_CONTENT_HEIGHT } from "@/constants/layout";
import * as Notifications from "expo-notifications";
import { registerPushNotificationsForCurrentDevice } from "@/lib/notifications";

export default function TabLayout() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobileWeb = Platform.OS === "web" && width <= 768;
  const bottomPadding = Platform.OS === "web" ? 0 : insets.bottom;
  const tabBarHeight = BOTTOM_NAV_CONTENT_HEIGHT + bottomPadding;
  const [unreadTotal, setUnreadTotal] = useState(0);
  const latestRooms = useRef<Awaited<ReturnType<typeof Api.getSharedChatRooms>>>([]);
  const { user } = useAuthContext();

  useEffect(() => {
    if (!user?.memberId) return;
    let pending = false;
    const refresh = () => {
      if (pending) return;
      pending = true;
      void Api.getSharedChatRooms()
        .then((rooms) => {
          latestRooms.current = rooms;
          setUnreadTotal(effectiveUnreadTotal(rooms));
        })
        .catch(() => {})
        .finally(() => { pending = false; });
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [user?.memberId]);

  useEffect(() => subscribeToOptimisticChatReads((_roomId, clearedCount) => {
    if (latestRooms.current.length) setUnreadTotal(effectiveUnreadTotal(latestRooms.current));
    else setUnreadTotal((current) => Math.max(0, current - clearedCount));
  }), []);

  useEffect(() => {
    if (!user?.id) return;
    const timer = setTimeout(() => { void Api.getMemberDirectory(String(user.id)).catch(() => {}); }, 2500);
    return () => clearTimeout(timer);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.memberId || Platform.OS === "web") return;
    void registerPushNotificationsForCurrentDevice().catch(() => {});
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const targetPath = response?.notification.request.content.data?.targetPath;
      if (typeof targetPath === "string" && targetPath.startsWith("/")) {
        router.push(targetPath as any);
        void Notifications.clearLastNotificationResponseAsync();
      }
    }).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const targetPath = response.notification.request.content.data?.targetPath;
      if (typeof targetPath === "string" && targetPath.startsWith("/")) router.push(targetPath as any);
    });
    return () => subscription.remove();
  }, [router, user?.memberId]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          marginHorizontal: 0,
          marginBottom: 0,
          paddingTop: 5,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderTopWidth: 1,
          shadowColor: "#6E5260",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: isMobileWeb ? 10 : 9,
          fontWeight: "700",
          lineHeight: 13,
          marginTop: 3,
          marginBottom: isMobileWeb ? 3 : 0,
        },
        tabBarShowLabel: true,
        sceneStyle: {
          backgroundColor: colors.background,
        },
        tabBarItemStyle: {
          borderRadius: 18,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "ホーム",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "イベント",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="board"
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.replace("/(tabs)/board");
          },
        }}
        options={{
          title: "掲示板",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="doc.text.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "チャット",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="bubble.left.and.bubble.right.fill" color={color} />,
          tabBarBadge: unreadTotal > 0 ? Math.min(unreadTotal, 99) : undefined,
          tabBarBadgeStyle: { backgroundColor: "#FF3B30", color: "#FFF", fontSize: 10, fontWeight: "800" },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "マイページ",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
