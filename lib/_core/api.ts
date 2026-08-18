import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "./auth";
import { logger } from "./logger";

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

export type AuthApiUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: string;
  role: Auth.UserRole;
  branch: Auth.BranchRole | null;
  branches: Auth.BranchRole[] | null;
};

export type PublicMember = {
  id: string;
  userId: number;
  displayName: string;
  accessRole: "member" | "club_leader" | "operator" | "admin";
  branches: string[];
  memberTerm: string | null;
  memberRank: string;
  achievementBadges: string[];
  joinedAt: string;
  profile: Record<string, unknown>;
  xp: number;
  participationCount: number;
  organizerCount: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // Determine the auth method:
  // - Native platform: use stored session token as Bearer auth
  // - Web (including iframe): use cookie-based auth (browser handles automatically)
  //   Cookie is set on backend domain via POST /api/auth/session after receiving token via postMessage
  if (Platform.OS !== "web") {
    const sessionToken = await Auth.getSessionToken();
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    }
  }

  const baseUrl = getApiBaseUrl();
  // Ensure no double slashes between baseUrl and endpoint
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = baseUrl ? `${cleanBaseUrl}${cleanEndpoint}` : endpoint;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorText;
      } catch {
        // Not JSON, use text as is
      }
      throw new ApiError(
        errorMessage || `API call failed: ${response.statusText}`,
        response.status,
      );
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      return data as T;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch (error) {
    logger.error(
      `API request failed: ${options.method || "GET"} ${endpoint}`,
      error,
    );
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error occurred");
  }
}

// OAuth callback handler - exchange code for session token
// Calls /api/oauth/mobile endpoint which returns JSON with app_session_id and user
export async function exchangeOAuthCode(
  code: string,
  state: string,
): Promise<{ sessionToken: string; user: any }> {
  // Use GET with query params
  const params = new URLSearchParams({ code, state });
  const endpoint = `/api/oauth/mobile?${params.toString()}`;
  const result = await apiCall<{ app_session_id: string; user: any }>(endpoint);

  // Convert app_session_id to sessionToken for compatibility
  const sessionToken = result.app_session_id;
  return {
    sessionToken,
    user: result.user,
  };
}

// Logout
export async function logout(): Promise<void> {
  await apiCall<void>("/api/auth/logout", {
    method: "POST",
  });
}

export async function login(email: string, password: string) {
  return apiCall<{ success: boolean; sessionToken: string; user: AuthApiUser }>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
  );
}

export async function requestSetupCode(email: string) {
  return apiCall<{ success: boolean }>("/api/auth/request-setup-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function register(input: {
  email: string;
  password: string;
  name: string;
  verificationCode: string;
}) {
  return apiCall<{ success: boolean; sessionToken: string; user: AuthApiUser }>(
    "/api/auth/register",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function selectBranches(branches: Auth.BranchRole[]) {
  return apiCall<{
    success: boolean;
    branch: Auth.BranchRole;
    branches: Auth.BranchRole[];
  }>("/api/auth/branches", {
    method: "POST",
    body: JSON.stringify({ branches }),
  });
}

// Get current authenticated user (web uses cookie-based auth)
export async function getMe(): Promise<AuthApiUser | null> {
  try {
    const result = await apiCall<{ user: any }>("/api/auth/me");
    return result.user || null;
  } catch (error) {
    logger.warn("Unable to fetch the authenticated user", error);
    return null;
  }
}

export async function getMemberDirectory() {
  const result = await apiCall<{ members: PublicMember[] }>("/api/members");
  return result.members;
}

export async function getMemberProfile(memberId: string) {
  const result = await apiCall<{ member: PublicMember }>(
    `/api/members/${encodeURIComponent(memberId)}`,
  );
  return result.member;
}

export async function getPrivateMemberNote(memberId: string) {
  return apiCall<{ note: string; updatedAt: string | null }>(
    `/api/members/${encodeURIComponent(memberId)}/private-note`,
  );
}

export async function setPrivateMemberNote(memberId: string, note: string) {
  return apiCall<{ success: boolean; updatedAt: string }>(
    `/api/members/${encodeURIComponent(memberId)}/private-note`,
    { method: "PATCH", body: JSON.stringify({ note }) },
  );
}

// Establish session cookie on the backend (3000-xxx domain)
// Called after receiving token via postMessage to get a proper Set-Cookie from the backend
export async function establishSession(token: string): Promise<boolean> {
  try {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/auth/session`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include", // Important: allows Set-Cookie to be stored
    });

    if (!response.ok) {
      logger.warn("Failed to establish the web session");
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Failed to establish the web session", error);
    return false;
  }
}
