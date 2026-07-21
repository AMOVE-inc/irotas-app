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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Auth.User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);

      if (Platform.OS === "web") {
        const apiUser = await Api.getMe();
        if (apiUser) {
          const userInfo: Auth.User = {
            id: apiUser.id,
            openId: apiUser.openId,
            name: apiUser.name,
            email: apiUser.email,
            loginMethod: apiUser.loginMethod,
            lastSignedIn: new Date(apiUser.lastSignedIn),
            role: Auth.normalizeUserRole(apiUser.role),
            branch: Auth.normalizeBranchRole(apiUser.branch),
            branches: Auth.normalizeBranchRoles(apiUser.branches, apiUser.branch),
          };
          setUser(userInfo);
          await Auth.setUserInfo(userInfo);
        } else {
          setUser(null);
          await Auth.clearUserInfo();
        }
      } else {
        // Native: check token first
        const sessionToken = await Auth.getSessionToken();
        if (!sessionToken) {
          setUser(null);
          return;
        }
        const cachedUser = await Auth.getUserInfo();
        if (cachedUser) {
          setUser(cachedUser);
        } else {
          setUser(null);
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
