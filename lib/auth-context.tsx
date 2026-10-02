import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Auth from "@/lib/_core/auth";
import * as Api from "@/lib/_core/api";
import { logger } from "@/lib/_core/logger";

type AuthContextType = {
  user: Auth.User | null;
  loading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: Auth.User | null) => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  refresh: async () => {},
  logout: async () => {},
  setUser: () => {},
});

const previewLoginEnabled = process.env.EXPO_PUBLIC_PREVIEW_LOGIN_ENABLED === "true";

function adminPreviewUser(): Auth.User {
  return {
    id: 1,
    openId: "preview-admin",
    name: "IRO+運営",
    email: "admin-preview@irotas.local",
    loginMethod: "preview",
    lastSignedIn: new Date(),
    role: "admin",
    accessRole: "admin",
    branch: "kanto",
    branches: ["kanto"],
  };
}

function toAuthUser(apiUser: Api.AuthApiUser): Auth.User {
  return {
    id: apiUser.id,
    openId: apiUser.openId,
    name: apiUser.name,
    email: apiUser.email,
    loginMethod: apiUser.loginMethod,
    lastSignedIn: new Date(apiUser.lastSignedIn),
    firstSignedIn: new Date(apiUser.firstSignedIn ?? apiUser.lastSignedIn),
    role: Auth.normalizeUserRole(apiUser.role),
    accessRole: Auth.normalizeAccessRole(apiUser.accessRole),
    branch: Auth.normalizeBranchRole(apiUser.branch),
    branches: Auth.normalizeBranchRoles(apiUser.branches, apiUser.branch),
    memberId: apiUser.memberId,
    publicUserId: apiUser.publicUserId,
    memberTerm: apiUser.memberTerm,
    memberRank: apiUser.memberRank,
    joinedAt: apiUser.joinedAt,
    achievementBadges: apiUser.achievementBadges,
    profile: apiUser.profile,
    xp: apiUser.xp,
    participationCount: apiUser.participationCount,
    organizerCount: apiUser.organizerCount,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Auth.User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      // Keep the navigation tree mounted during profile refreshes. Unmounting it
      // resets the active tab to Home when the editor closes.

      if (Platform.OS === "web") {
        const apiUser = await Api.getMe();
        if (apiUser) {
          const userInfo = toAuthUser(apiUser);
          setUser(userInfo);
          await Auth.setUserInfo(userInfo);
        } else if (
          previewLoginEnabled &&
          ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
          ["/admin-dashboard", "/coupon-manager", "/csv-import", "/campaign-manager", "/gift-campaign-manager"].some((path) =>
            window.location.pathname.startsWith(path),
          )
        ) {
          // Management previews are intentionally limited to the local machine.
          // Public deployments must never mint client-side admin privileges.
          const previewAdmin = adminPreviewUser();
          setUser(previewAdmin);
          await Auth.setUserInfo(previewAdmin);
        } else if (
          previewLoginEnabled &&
          ["localhost", "127.0.0.1"].includes(window.location.hostname)
        ) {
          // Preserve the synthetic member while it moves through first-login
          // setup. A concurrent session refresh used to clear it immediately
          // after branch selection and redirect back to the selection screen.
          const cachedPreviewUser = await Auth.getUserInfo();
          if (cachedPreviewUser?.loginMethod === "preview") {
            setUser(cachedPreviewUser);
          } else {
            setUser(null);
            await Auth.clearUserInfo();
          }
        } else {
          setUser(null);
          await Auth.clearUserInfo();
        }
      } else {
        // Native: render cached data first, then reconcile membership and
        // permissions with the shared server used by Web/PWA.
        const sessionToken = await Auth.getSessionToken();
        if (!sessionToken) {
          setUser(null);
          await Auth.clearUserInfo();
          return;
        }
        const cachedUser = await Auth.getUserInfo();
        setUser(cachedUser);
        try {
          const apiUser = await Api.getMeStrict();
          if (!apiUser) {
            await Auth.removeSessionToken();
            await Auth.clearUserInfo();
            setUser(null);
            return;
          }
          const userInfo = toAuthUser(apiUser);
          await Auth.setUserInfo(userInfo);
          setUser(userInfo);
        } catch (error) {
          logger.warn("Unable to reconcile the native session; keeping the cached user", error);
          if (!cachedUser) {
            setUser(null);
          }
        }
      }
    } catch (err) {
      logger.error("Failed to refresh authenticated user", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await Api.logout();
    } catch (err) {
      logger.warn("Server logout failed; clearing the local session", err);
    } finally {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: Boolean(user),
        refresh: fetchUser,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}
