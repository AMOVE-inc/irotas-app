import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View , Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import {
  initManusRuntime,
  subscribeSafeAreaInsets,
} from "@/lib/_core/manus-runtime";
import { AuthProvider, useAuthContext } from "@/lib/auth-context";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import {
  isAdminRole,
  isAdminRoute,
  isOperatorRole,
  isOperatorRoute,
} from "@/lib/access-control";
import { dispatchDueEventActions } from "@/lib/event-automation-store";
import { GourmetReportReminderGate } from "@/components/gourmet-report-reminder-gate";
import { GlobalLoadingOverlay } from "@/components/global-loading-overlay";
import { LiveNotificationBanner } from "@/components/live-notification-banner";
import { hasCompletedNativeProfileSetup } from "@/lib/native-profile-setup";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { XpRewardPopup } from "@/components/xp-reward-popup";
import { levelFromXp, rankFromXp } from "@/lib/xp-levels";
import type { MemberRank } from "@/constants/mock-data";

// Mobile browsers already exclude the status bar from their visual viewport.
// Keep only a small breathing space instead of adding a native-sized 44px inset.
const WEB_TOP_INSET = 8;
const DEFAULT_WEB_INSETS: EdgeInsets = {
  top: WEB_TOP_INSET,
  right: 0,
  bottom: 0,
  left: 0,
};
const getRootFrame = (): Rect => {
  if (typeof document !== "undefined") {
    const el = document.getElementById("root");
    if (el) {
      const r = el.getBoundingClientRect();
      return { x: 0, y: 0, width: r.width, height: r.height };
    }
  }
  if (typeof window !== "undefined") {
    return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  }
  return { x: 0, y: 0, width: 390, height: 844 };
};

const MEMBER_RANKS: MemberRank[] = ["regular", "silver", "gold", "platinum"];

function ProgressCelebrationGate() {
  const { user } = useAuthContext();
  const [reward, setReward] = useState<import("@/lib/xp-store").XpReward | null>(null);
  useEffect(() => {
    if (!user?.memberId || !Number.isFinite(Number(user.xp))) return;
    const currentXp = Math.max(0, Number(user.xp));
    const currentRank = MEMBER_RANKS.includes(user.memberRank as MemberRank) ? user.memberRank as MemberRank : rankFromXp(currentXp);
    const key = `irotas_seen_progress_v1:${user.memberId}`;
    let active = true;
    void AsyncStorage.getItem(key).then(async (stored) => {
      const previous = (() => { try { return stored ? JSON.parse(stored) as { xp?: number; rank?: MemberRank } : null; } catch { return null; } })();
      await AsyncStorage.setItem(key, JSON.stringify({ xp: currentXp, rank: currentRank }));
      if (!active || !previous || !Number.isFinite(Number(previous.xp))) return;
      const previousXp = Math.max(0, Number(previous.xp));
      const previousRank = MEMBER_RANKS.includes(previous.rank as MemberRank) ? previous.rank as MemberRank : rankFromXp(previousXp);
      const previousLevel = levelFromXp(previousXp);
      const nextLevel = levelFromXp(currentXp);
      const rankUp = MEMBER_RANKS.indexOf(currentRank) > MEMBER_RANKS.indexOf(previousRank);
      if (nextLevel <= previousLevel && !rankUp) return;
      setReward({ amount: Math.max(0, currentXp - previousXp), reason: "XPが反映されました", previousXp, nextXp: currentXp, previousLevel, nextLevel, previousRank, nextRank: currentRank });
    }).catch(() => {});
    return () => { active = false; };
  }, [user?.memberId, user?.memberRank, user?.xp]);
  return <XpRewardPopup reward={reward} onClose={() => setReward(null)} />;
}

export const unstable_settings = {
  anchor: "(tabs)",
};

/** Auth guard: redirect to login if not authenticated */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, user } = useAuthContext();
  const segments = useSegments();
  const router = useRouter();
  const currentRoute = segments[0];
  const isForbidden =
    isAuthenticated &&
    ((isAdminRoute(currentRoute) &&
      !isAdminRole(user?.role, user?.accessRole)) ||
      (isOperatorRoute(currentRoute) &&
        !isOperatorRole(user?.role, user?.accessRole)));
  const hasSelectedBranch = Boolean(
    user && (user.branches.length > 0 || user.branch),
  );
  const [profileGateReady, setProfileGateReady] = useState(Platform.OS === "web");
  const [profileGateComplete, setProfileGateComplete] = useState(Platform.OS === "web");

  // This check is tied to the signed-in profile, not to the current route.
  // Including `currentRoute` here unmounted the entire native navigation tree
  // on every root-screen transition. When the tree remounted, Expo Router
  // restored the anchored tab navigator at its initial Home screen.
  useEffect(() => {
    if (Platform.OS === "web" || !user?.memberId) {
      setProfileGateReady(true);
      setProfileGateComplete(true);
      return;
    }
    let active = true;
    setProfileGateReady(false);
    void hasCompletedNativeProfileSetup(user.id).then((completed) => {
      if (!active) return;
      setProfileGateComplete(completed && Boolean(user.name?.trim()) && Boolean(user.publicUserId?.trim()));
      setProfileGateReady(true);
    });
    return () => { active = false; };
  }, [user?.id, user?.memberId, user?.name, user?.publicUserId]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "login" || segments[0] === "register";
    const inOAuthCallback = segments[0] === "oauth";
    const inPublicAccountDeletion = String(segments[0]) === "account-deletion";
    const inBranchSelection = String(segments[0]) === "select-branch";
    const inProfileSetup = String(segments[0]) === "profile-setup";

    if (
      !isAuthenticated &&
      !inAuthGroup &&
      !inOAuthCallback &&
      !inPublicAccountDeletion
    ) {
      // Redirect to login
      router.replace("/login");
    } else if (
      isAuthenticated &&
      !hasSelectedBranch &&
      !inBranchSelection &&
      !inOAuthCallback
    ) {
      router.replace("/select-branch" as any);
    } else if (isAuthenticated && hasSelectedBranch && profileGateReady && !profileGateComplete && !inProfileSetup && !inOAuthCallback) {
      router.replace("/profile-setup" as any);
    } else if (isAuthenticated && hasSelectedBranch && inAuthGroup) {
      // Redirect to home if already logged in
      router.replace("/(tabs)");
    } else if (isForbidden) {
      router.replace("/(tabs)/profile");
    }
  }, [
    hasSelectedBranch,
    profileGateComplete,
    profileGateReady,
    isAuthenticated,
    isForbidden,
    loading,
    segments,
    router,
  ]);

  if (loading || (isAuthenticated && !profileGateReady)) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#FFF8F0",
        }}
      >
        <ActivityIndicator size="large" color="#E8A0BF" />
      </View>
    );
  }

  if (isForbidden) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#FFF8F0",
        }}
      >
        <ActivityIndicator size="large" color="#E8A0BF" />
      </View>
    );
  }

  return <><ProgressCelebrationGate />{children}</>;
}

export default function RootLayout() {
  const [iconsLoaded] = useFonts(MaterialIcons.font);
  const [webIconFontReady, setWebIconFontReady] = useState(Platform.OS !== "web");
  useEffect(() => {
    if (Platform.OS !== "web" || !iconsLoaded) return;
    let active = true;
    // Safari can paint fallback tofu glyphs before its font face is actually ready.
    void document.fonts.load("24px material").then(() => {
      if (active) setWebIconFontReady(true);
    }).catch(() => {
      if (active) setWebIconFontReady(true);
    });
    const fallback = window.setTimeout(() => { if (active) setWebIconFontReady(true); }, 5000);
    return () => { active = false; window.clearTimeout(fallback); };
  }, [iconsLoaded]);
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? getRootFrame();

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Keep frame in sync with actual root element size on web
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const updateFrame = () => {
      setFrame(getRootFrame());
    };
    updateFrame();
    const rootEl = document.getElementById("root");
    let observer: ResizeObserver | null = null;
    if (rootEl && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateFrame);
      observer.observe(rootEl);
    }
    window.addEventListener("resize", updateFrame);
    window.addEventListener("orientationchange", updateFrame);
    window.addEventListener("pageshow", updateFrame);
    return () => {
      window.removeEventListener("resize", updateFrame);
      window.removeEventListener("orientationchange", updateFrame);
      window.removeEventListener("pageshow", updateFrame);
      observer?.disconnect();
    };
  }, []);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  useEffect(() => {
    void dispatchDueEventActions();
    const timer = setInterval(() => {
      void dispatchDueEventActions();
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets({
      ...metrics.insets,
      top: WEB_TOP_INSET,
    });
    setFrame(Platform.OS === "web" ? getRootFrame() : metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum padding for top and bottom
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? {
      insets: initialInsets,
      frame: initialFrame,
    };
    if (Platform.OS === "web") {
      return {
        ...metrics,
        insets: { top: WEB_TOP_INSET, right: 0, bottom: 0, left: 0 },
        frame: initialFrame,
      };
    }
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 44),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1, minHeight: 0, backgroundColor: "#FFFFFF" }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AuthGuard>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFFFF" } }}>
                <Stack.Screen
                  name="login"
                  options={{ presentation: "fullScreenModal" }}
                />
                <Stack.Screen
                  name="register"
                  options={{ presentation: "fullScreenModal" }}
                />
                <Stack.Screen
                  name="select-branch"
                  options={{ presentation: "fullScreenModal" }}
                />
                <Stack.Screen name="profile-setup" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="event-detail"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="event-feedback"
                  options={{ presentation: "modal" }}
                />
                <Stack.Screen
                  name="my-events"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="concierge"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="notifications"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen name="search" options={{ presentation: "card" }} />
                <Stack.Screen
                  name="create-post"
                  options={{ presentation: "modal" }}
                />
                <Stack.Screen
                  name="coupons"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="chat-list"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen name="chat" options={{ presentation: "card" }} />
                <Stack.Screen name="clubs" options={{ presentation: "card" }} />
                <Stack.Screen
                  name="member-profile"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="create-event"
                  options={{ presentation: "modal" }}
                />
                <Stack.Screen
                  name="members"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="admin-dashboard"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="coupon-manager"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="gift-campaign"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="campaigns"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="gourmet-map"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="campaign-manager"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="gift-campaign-manager"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="csv-import"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="app-settings"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="ai-settings"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="notification-settings"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen name="faq" options={{ presentation: "card" }} />
                <Stack.Screen
                  name="community-rules"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="contact"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen
                  name="manual"
                  options={{ presentation: "card" }}
                />
                <Stack.Screen name="oauth/callback" />
              </Stack>
              <LiveNotificationBanner />
              <GourmetReportReminderGate />
              <GlobalLoadingOverlay />
            </AuthGuard>
          </AuthProvider>
          <StatusBar style="auto" />
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  if (!iconsLoaded || !webIconFontReady) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#FFFFFF",
        }}
      >
        <ActivityIndicator size="large" color="#D97FA8" />
      </View>
    );
  }

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <AppErrorBoundary>
        <ThemeProvider>
          <SafeAreaProvider initialMetrics={providerInitialMetrics}>
            <SafeAreaFrameContext.Provider value={frame}>
              <SafeAreaInsetsContext.Provider value={insets}>
                {content}
              </SafeAreaInsetsContext.Provider>
            </SafeAreaFrameContext.Provider>
          </SafeAreaProvider>
        </ThemeProvider>
      </AppErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          {content}
        </SafeAreaProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
