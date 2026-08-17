import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/oauth";
import { logger } from "@/lib/_core/logger";
import {
  normalizeBranchRole,
  normalizeBranchRoles,
  normalizeUserRole,
  type BranchRole,
  type UserRole,
} from "@/lib/access-control";

export {
  normalizeBranchRole,
  normalizeBranchRoles,
  normalizeUserRole,
  type BranchRole,
  type UserRole,
} from "@/lib/access-control";

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: Date;
  role: UserRole;
  branch: BranchRole | null;
  branches: BranchRole[];
};

function deserializeUser(value: string): User | null {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") return null;

  const candidate = parsed as Partial<User> & { lastSignedIn?: string | Date };
  if (typeof candidate.id !== "number" || typeof candidate.openId !== "string") return null;

  const lastSignedIn = new Date(candidate.lastSignedIn ?? 0);
  if (Number.isNaN(lastSignedIn.getTime())) return null;

  return {
    id: candidate.id,
    openId: candidate.openId,
    name: typeof candidate.name === "string" ? candidate.name : null,
    email: typeof candidate.email === "string" ? candidate.email : null,
    loginMethod: typeof candidate.loginMethod === "string" ? candidate.loginMethod : null,
    lastSignedIn,
    role: normalizeUserRole(candidate.role),
    branch: normalizeBranchRole(candidate.branch),
    branches: normalizeBranchRoles(candidate.branches, candidate.branch),
  };
}

export async function getSessionToken(): Promise<string | null> {
  try {
    // Web platform uses cookie-based auth, no manual token management needed
    if (Platform.OS === "web") {
      return null;
    }

    // Use SecureStore for native
    const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    return token;
  } catch (error) {
    logger.error("Failed to get session token", error);
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  try {
    // Web platform uses cookie-based auth, no manual token management needed
    if (Platform.OS === "web") {
      return;
    }

    // Use SecureStore for native
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
  } catch (error) {
    logger.error("Failed to set session token", error);
    throw error;
  }
}

export async function removeSessionToken(): Promise<void> {
  try {
    // Web platform uses cookie-based auth, logout is handled by server clearing cookie
    if (Platform.OS === "web") {
      return;
    }

    // Use SecureStore for native
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  } catch (error) {
    logger.error("Failed to remove session token", error);
  }
}

export async function getUserInfo(): Promise<User | null> {
  try {
    let info: string | null = null;
    if (Platform.OS === "web") {
      // Only synthetic preview users are cached on web. Real member identity is
      // always reloaded from the HttpOnly server session.
      info = window.localStorage.getItem(USER_INFO_KEY);
    } else {
      // Use SecureStore for native
      info = await SecureStore.getItemAsync(USER_INFO_KEY);
    }

    if (!info) {
      return null;
    }
    const user = deserializeUser(info);
    if (Platform.OS === "web" && user?.loginMethod !== "preview") return null;
    return user;
  } catch (error) {
    logger.error("Failed to get cached user info", error);
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (user.loginMethod === "preview") {
        window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
      } else {
        window.localStorage.removeItem(USER_INFO_KEY);
      }
      return;
    }

    // Use SecureStore for native
    await SecureStore.setItemAsync(USER_INFO_KEY, JSON.stringify(user));
  } catch (error) {
    logger.error("Failed to cache user info", error);
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // Use localStorage for web
      window.localStorage.removeItem(USER_INFO_KEY);
      return;
    }

    // Use SecureStore for native
    await SecureStore.deleteItemAsync(USER_INFO_KEY);
  } catch (error) {
    logger.error("Failed to clear cached user info", error);
  }
}
