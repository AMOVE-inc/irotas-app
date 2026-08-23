import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "./auth";
import { logger } from "./logger";
import type { BoardPoll, Event } from "@/constants/mock-data";
import type { RawDiscordBoardArchive } from "@/lib/discord-board-import";

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
  accessRole: Auth.AccessRole;
  branch: Auth.BranchRole | null;
  branches: Auth.BranchRole[] | null;
  memberId: string | null;
  memberTerm: string | null;
  memberRank: string;
  joinedAt: string | null;
  achievementBadges: string[];
  profile: Record<string, unknown>;
  xp: number;
  participationCount: number;
  organizerCount: number;
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
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  followsViewer: boolean;
  isFriend: boolean;
};

export type OperatorMember = {
  userId: number;
  memberId: string | null;
  displayName: string;
  memberTerm: string | null;
};

export type SystemAuditLog = {
  id: number;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

export type ApplicationErrorLog = {
  id: number;
  request_id: string;
  method: string;
  path: string;
  error_name: string;
  error_message: string;
  created_at: string;
};

export type ClubApplicationRecord = {
  memberId: string;
  wantsToDo: string;
  messageToLeader: string;
  status: "pending" | "on_hold";
  appliedAt: string;
};

export type ClubRecord = {
  id: string;
  name: string;
  description: string;
  icon: string;
  leaderId: string;
  leaderName: string;
  memberIds: string[];
  applicantIds: string[];
  applications: ClubApplicationRecord[];
  createdByAdmin: true;
  events: [];
  status: "active" | "archived";
  canReviewApplications: boolean;
  viewerMembershipStatus: "pending" | "on_hold" | "approved" | "rejected" | "left" | null;
  viewerIsLeader: boolean;
  viewerMemberId: string | null;
};

export type ClubApplicantReview = {
  memberId: string;
  displayName: string;
  memberTerm: string | null;
  memberRank: string;
  branches: string[];
  profile: Record<string, unknown>;
  joinedAt: string;
  participationCount: number;
  organizerCount: number;
  wantsToDo: string;
  messageToLeader: string;
  status: "pending" | "on_hold";
  appliedAt: string;
  eventHistory: Array<{ id: string; title: string; date: string; eventType: string }>;
};

export type AppNotification = {
  id: string;
  type: "club_application" | "club_approval" | "club_membership" | "event_confirmed" | "event_deadline" | "event_reminder" | "event_cancellation" | "poll_result" | "announcement" | "event" | "like" | "comment" | "coupon";
  title: string;
  body: string;
  clubId: string | null;
  eventId: string | null;
  read: boolean;
  createdAt: string;
};

export type SharedBoardThread = {
  id: string;
  authorId: string;
  authorName: string;
  category: string;
  title: string;
  content: string;
  status: "open" | "closed" | "none";
  pinned: boolean;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  reactions: Record<string, { count: number; reacted: boolean }>;
};

export type SharedBoardComment = {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  content: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  reactions: Record<string, { count: number; reacted: boolean }>;
};

export type SharedChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  externalAuthorName: string;
  content: string;
  imageUri?: string;
  reactions: Record<string, string[]>;
  createdAt: string;
  updatedAt: string;
  shared: true;
};

export type SharedChatRoom = {
  id: string;
  name: string;
  type: "event" | "board" | "club" | "rank" | "dm" | "group";
  sourceId: string;
  participants: string[];
  createdBy: string;
  requiredRank?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  shared: true;
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

export type SharedBenefits = {
  memberRank: "regular" | "silver" | "gold" | "platinum";
  coupons: import("@/constants/mock-data").Coupon[];
  usages: Record<string, import("@/lib/coupon-rules").CouponUsage>;
  gifts: import("@/lib/gift-campaign-store").GiftCampaign[];
  applications: import("@/lib/gift-campaign-store").GiftApplication[];
  points: { balance: number; balances: Record<string, number>; history: Array<Record<string, unknown>> };
};

export function getSharedBenefits() {
  return apiCall<SharedBenefits>("/api/benefits");
}

export function saveSharedCoupon(coupon: import("@/constants/mock-data").Coupon) {
  return apiCall<{ success: true }>(`/api/benefits/coupons/${encodeURIComponent(coupon.id)}`, { method: "PUT", body: JSON.stringify(coupon) });
}

export function deleteSharedCoupon(couponId: string) {
  return apiCall<{ success: true }>(`/api/benefits/coupons/${encodeURIComponent(couponId)}`, { method: "DELETE" });
}

export function useSharedCoupon(couponId: string, action: "present" | "redeem") {
  return apiCall<{ success: true; usage: import("@/lib/coupon-rules").CouponUsage }>(`/api/benefits/coupons/${encodeURIComponent(couponId)}/${action}`, { method: "POST" });
}

export function saveSharedGift(gift: import("@/lib/gift-campaign-store").GiftCampaign) {
  return apiCall<{ success: true }>(`/api/benefits/gifts/${encodeURIComponent(gift.id)}`, { method: "PUT", body: JSON.stringify(gift) });
}

export function deleteSharedGift(giftId: string) {
  return apiCall<{ success: true }>(`/api/benefits/gifts/${encodeURIComponent(giftId)}`, { method: "DELETE" });
}

export function applyForSharedGift(giftId: string) {
  return apiCall<{ success: true; alreadyApplied: boolean }>(`/api/benefits/gifts/${encodeURIComponent(giftId)}/apply`, { method: "POST" });
}

export function runSharedGiftLottery(giftId: string) {
  return apiCall<{ success: true; winnerIds: string[] }>(`/api/benefits/gifts/${encodeURIComponent(giftId)}/lottery`, { method: "POST" });
}

export function adjustSharedIrotasPoints(input: { amount: number; reason: string; idempotencyKey: string; memberId?: string }) {
  return apiCall<{ success: true; balance: number; duplicate?: boolean; transactionId?: string }>("/api/benefits/points/adjust", { method: "POST", body: JSON.stringify(input) });
}

export function awardSharedXp(action: "event_create" | "board_post" | "meal_report_post", sourceId: string) {
  return apiCall<{ amount: number; reason: string; previousXp: number; nextXp: number; previousRank: import("@/constants/mock-data").MemberRank; nextRank: import("@/constants/mock-data").MemberRank; duplicate?: boolean }>("/api/xp/award", {
    method: "POST",
    body: JSON.stringify({ action, sourceId }),
  });
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

export async function getSharedBoardContent(category?: string) {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  return apiCall<{ threads: SharedBoardThread[]; comments: SharedBoardComment[] }>(
    `/api/board/content${query}`,
  );
}

export async function createSharedBoardThread(input: {
  category: string;
  title: string;
  content: string;
  status?: "open" | "closed" | "none";
  data?: Record<string, unknown>;
}) {
  return apiCall<{ id: string; createdAt: string }>("/api/board/threads", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createSharedBoardComment(
  threadId: string,
  input: { content: string; data?: Record<string, unknown> },
) {
  return apiCall<{ id: string; createdAt: string }>(
    `/api/board/threads/${encodeURIComponent(threadId)}/comments`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function ensureSharedImportedBoardThread(threadId: string) {
  return apiCall<{ success: true; id: string }>(
    `/api/board/imported-threads/${encodeURIComponent(threadId)}/ensure`,
    { method: "POST" },
  );
}

export async function updateSharedBoardThread(
  threadId: string,
  input: Partial<Pick<SharedBoardThread, "title" | "content" | "status" | "pinned" | "data">>,
) {
  return apiCall<{ success: true; updatedAt: string }>(
    `/api/board/threads/${encodeURIComponent(threadId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function deleteSharedBoardThread(threadId: string) {
  return apiCall<{ success: true }>(`/api/board/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
  });
}

export async function updateSharedBoardComment(
  commentId: string,
  input: { content?: string; data?: Record<string, unknown> },
) {
  return apiCall<{ success: true; updatedAt: string }>(
    `/api/board/comments/${encodeURIComponent(commentId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function deleteSharedBoardComment(commentId: string) {
  return apiCall<{ success: true }>(`/api/board/comments/${encodeURIComponent(commentId)}`, {
    method: "DELETE",
  });
}

export async function setSharedBoardReaction(input: {
  targetType: "thread" | "comment";
  targetId: string;
  emoji: string;
}, active: boolean) {
  return apiCall<{ success: true }>("/api/board/reactions", {
    method: active ? "PUT" : "DELETE",
    body: JSON.stringify(input),
  });
}

export async function getSharedBoardPoll(ownerType: "thread" | "comment", ownerId: string) {
  return apiCall<{ poll: BoardPoll; viewerMemberId: string }>(
    `/api/board/polls/${ownerType}/${encodeURIComponent(ownerId)}`,
  );
}

export async function voteSharedBoardPoll(ownerType: "thread" | "comment", ownerId: string, optionId: string) {
  return apiCall<{ poll: BoardPoll; viewerMemberId: string }>(
    `/api/board/polls/${ownerType}/${encodeURIComponent(ownerId)}`,
    { method: "PUT", body: JSON.stringify({ optionId }) },
  );
}

export async function getSharedChatMessages(roomId: string) {
  const result = await apiCall<{ messages: SharedChatMessage[] }>(
    `/api/chats/${encodeURIComponent(roomId)}/messages`,
  );
  return result.messages;
}

export async function getSharedChatRooms() {
  const result = await apiCall<{ rooms: SharedChatRoom[] }>("/api/chats");
  return result.rooms;
}

export async function createSharedChatRoom(input: {
  type: "dm" | "group";
  name?: string;
  memberIds: string[];
}) {
  const result = await apiCall<{ room: SharedChatRoom }>("/api/chats", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.room;
}

export async function renameSharedChatRoom(roomId: string, name: string) {
  const result = await apiCall<{ room: SharedChatRoom }>(
    `/api/chats/${encodeURIComponent(roomId)}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
  );
  return result.room;
}

export async function deleteSharedChatRoom(roomId: string) {
  return apiCall<{ success: true }>(`/api/chats/${encodeURIComponent(roomId)}`, {
    method: "DELETE",
  });
}

export async function addSharedChatRoomMember(roomId: string, memberId: string) {
  const result = await apiCall<{ room: SharedChatRoom }>(
    `/api/chats/${encodeURIComponent(roomId)}/members`,
    { method: "POST", body: JSON.stringify({ memberId }) },
  );
  return result.room;
}

export async function removeSharedChatRoomMember(roomId: string, memberId: string) {
  return apiCall<{ success: true }>(
    `/api/chats/${encodeURIComponent(roomId)}/members/${encodeURIComponent(memberId)}`,
    { method: "DELETE" },
  );
}

export async function markSharedChatRoomRead(roomId: string) {
  return apiCall<{ success: true }>(`/api/chats/${encodeURIComponent(roomId)}/read`, {
    method: "PUT",
  });
}

export async function createSharedChatMessage(
  roomId: string,
  input: { content: string; imageUrl?: string },
) {
  const result = await apiCall<{ message: SharedChatMessage }>(
    `/api/chats/${encodeURIComponent(roomId)}/messages`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return result.message;
}

export async function setSharedChatReaction(
  messageId: string,
  emoji: string,
  active: boolean,
) {
  return apiCall<{ success: true; reactions: Record<string, string[]> }>(
    "/api/chats/reactions",
    { method: active ? "PUT" : "DELETE", body: JSON.stringify({ messageId, emoji }) },
  );
}

/**
 * Web logout uses a top-level form navigation so the browser applies the
 * Set-Cookie deletion before React can re-check the current session.
 */
export function submitBrowserLogout(): boolean {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/auth/logout?redirect=login";
  form.style.display = "none";
  document.body.appendChild(form);
  form.submit();
  return true;
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

export async function getOperatorMembers() {
  const result = await apiCall<{ operators: OperatorMember[] }>("/api/admin/operators");
  return result.operators;
}

export async function updateOperatorMemberTerm(userId: number, memberTerm: string | null) {
  const result = await apiCall<{ operator: OperatorMember }>(
    `/api/admin/operators/${userId}/member-term`,
    { method: "PATCH", body: JSON.stringify({ memberTerm }) },
  );
  return result.operator;
}

export async function getSystemMonitoring() {
  return apiCall<{
    generatedAt: string;
    auditLogs: SystemAuditLog[];
    applicationErrors: ApplicationErrorLog[];
  }>("/api/admin/system-monitoring");
}

export async function getMemberProfile(memberId: string) {
  const result = await apiCall<{ member: PublicMember }>(
    `/api/members/${encodeURIComponent(memberId)}`,
  );
  return result.member;
}

export async function updateMyProfile(input: {
  displayName: string;
  profile: Record<string, unknown>;
}) {
  return apiCall<{ success: boolean; displayName: string; profile: Record<string, unknown>; updatedAt: string }>(
    "/api/members/me/profile",
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function setMemberFollow(memberId: string, following: boolean) {
  const result = await apiCall<{ member: PublicMember }>(`/api/members/${encodeURIComponent(memberId)}/follow`, {
    method: following ? "PUT" : "DELETE",
  });
  return result.member;
}

export async function getMemberSocialList(memberId: string, kind: "followers" | "following") {
  const result = await apiCall<{ members: PublicMember[] }>(`/api/members/${encodeURIComponent(memberId)}/${kind}`);
  return result.members;
}

export async function getPrivateMemberNote(memberId: string) {
  return apiCall<{ note: string; updatedAt: string | null }>(
    `/api/members/${encodeURIComponent(memberId)}/private-note`,
  );
}

export async function getClubs() {
  const result = await apiCall<{ clubs: ClubRecord[] }>("/api/clubs");
  return result.clubs;
}

export async function getBoardArchive(scope: "all" | "public" = "all") {
  return apiCall<RawDiscordBoardArchive>(`/api/board/archive?scope=${scope}`);
}

export async function getClub(clubId: string) {
  const result = await apiCall<{ club: ClubRecord }>(`/api/clubs/${encodeURIComponent(clubId)}`);
  return result.club;
}

export async function submitClubApplication(clubId: string, wantsToDo: string, messageToLeader: string) {
  const result = await apiCall<{ club: ClubRecord }>(`/api/clubs/${encodeURIComponent(clubId)}/applications`, {
    method: "POST",
    body: JSON.stringify({ wantsToDo, messageToLeader }),
  });
  return result.club;
}

export async function reviewClubApplication(clubId: string, memberId: string, action: "approve" | "hold" | "reject") {
  const result = await apiCall<{ club: ClubRecord }>(
    `/api/clubs/${encodeURIComponent(clubId)}/applications/${encodeURIComponent(memberId)}`,
    { method: "PATCH", body: JSON.stringify({ action }) },
  );
  return result.club;
}

export async function getClubApplicantReview(clubId: string, memberId: string) {
  const result = await apiCall<{ review: ClubApplicantReview }>(
    `/api/clubs/${encodeURIComponent(clubId)}/applications/${encodeURIComponent(memberId)}`,
  );
  return result.review;
}

export async function leaveClub(clubId: string) {
  const result = await apiCall<{ club: ClubRecord }>(`/api/clubs/${encodeURIComponent(clubId)}/membership`, {
    method: "DELETE",
  });
  return result.club;
}

export async function removeClubMember(clubId: string, memberId: string) {
  const result = await apiCall<{ club: ClubRecord }>(
    `/api/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(memberId)}`,
    { method: "DELETE" },
  );
  return result.club;
}

export async function getNotifications() {
  const result = await apiCall<{ notifications: AppNotification[] }>("/api/notifications");
  return result.notifications;
}

export async function getHomeActivities() {
  const result = await apiCall<{ activities: import("@/lib/home-activity-store").HomeActivity[] }>("/api/home/activities");
  return result.activities;
}

export async function markNotificationRead(notificationId: string) {
  const result = await apiCall<{ notification: AppNotification }>(
    `/api/notifications/${encodeURIComponent(notificationId)}`,
    { method: "PATCH" },
  );
  return result.notification;
}

export async function markAllNotificationsRead() {
  return apiCall<{ success: boolean; readAt: string }>("/api/notifications/read-all", { method: "PATCH" });
}

export async function setPrivateMemberNote(memberId: string, note: string) {
  return apiCall<{ success: boolean; updatedAt: string }>(
    `/api/members/${encodeURIComponent(memberId)}/private-note`,
    { method: "PATCH", body: JSON.stringify({ note }) },
  );
}

export async function getEvents() {
  const result = await apiCall<{ events: Event[] }>("/api/events");
  return result.events;
}

export async function getEvent(eventId: string) {
  const result = await apiCall<{ event: Event }>(`/api/events/${encodeURIComponent(eventId)}`);
  return result.event;
}

export async function uploadEventImage(uri: string) {
  const source = await fetch(uri);
  if (!source.ok) throw new Error("画像を読み込めませんでした");
  const blob = await source.blob();
  const baseUrl = getApiBaseUrl();
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const headers: Record<string, string> = { "content-type": blob.type || "image/jpeg" };
  if (Platform.OS !== "web") {
    const sessionToken = await Auth.getSessionToken();
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  }
  const response = await fetch(`${cleanBaseUrl}/api/event-images`, {
    method: "POST",
    headers,
    body: blob,
    credentials: "include",
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(result.error ?? "画像を保存できませんでした", response.status);
  }
  return (await response.json()) as { imageUrl: string };
}

export async function createEvent(event: Event) {
  const result = await apiCall<{ event: Event }>("/api/events", {
    method: "POST",
    body: JSON.stringify({ event: { ...event, privateMemo: undefined }, privateMemo: event.privateMemo }),
  });
  return result.event;
}

export async function setEventFavorite(eventId: string, favorite: boolean) {
  return apiCall<{ success: boolean; favorite: boolean }>(
    `/api/events/${encodeURIComponent(eventId)}/favorite`,
    { method: "PUT", body: JSON.stringify({ favorite }) },
  );
}

export async function applyToEvent(eventId: string, termsAccepted: boolean, pointsToUse = 0) {
  return apiCall<{ event: Event; pointBalance: number | null; pointsUsed: number }>(
    `/api/events/${encodeURIComponent(eventId)}/applications`,
    { method: "POST", body: JSON.stringify({ termsAccepted, pointsToUse }) },
  );
}

export async function reviewEventApplicant(eventId: string, memberId: string, action: "approve" | "cancel") {
  const result = await apiCall<{ event: Event }>(
    `/api/events/${encodeURIComponent(eventId)}/participants/${encodeURIComponent(memberId)}`,
    { method: "PATCH", body: JSON.stringify({ action }) },
  );
  return result.event;
}

export async function finalizeEventParticipants(eventId: string) {
  const result = await apiCall<{ event: Event }>(
    `/api/events/${encodeURIComponent(eventId)}/finalize`,
    { method: "POST" },
  );
  return result.event;
}

export async function cancelEvent(eventId: string) {
  return apiCall<{ success: boolean; cancelled: boolean }>(
    `/api/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify({ action: "cancel" }) },
  );
}

export async function requestEventCancellation(eventId: string, contactedOrganizer: boolean, policyConfirmed: boolean) {
  const result = await apiCall<{ event: Event }>(
    `/api/events/${encodeURIComponent(eventId)}/cancellation-requests`,
    { method: "POST", body: JSON.stringify({ contactedOrganizer, policyConfirmed }) },
  );
  return result.event;
}

export async function reviewEventCancellation(eventId: string, memberId: string, action: "approve" | "reject") {
  const result = await apiCall<{ event: Event }>(
    `/api/events/${encodeURIComponent(eventId)}/cancellation-requests/${encodeURIComponent(memberId)}`,
    { method: "PATCH", body: JSON.stringify({ action }) },
  );
  return result.event;
}

export async function syncSquareSubscriptions(offset = 0) {
  return apiCall<{
    success: boolean;
    scanned: number;
    updated: number;
    failed: number;
    total: number;
    nextOffset: number;
    hasMore: boolean;
  }>(
    "/api/admin/square-sync",
    { method: "POST", body: JSON.stringify({ offset }) },
  );
}

export type MembershipSummary = {
  total: number;
  active: number;
  grace: number;
  suspended: number;
  pending: number;
  missingSubscription: number;
  webhookEvents: number;
  webhookFailures: number;
  lastVerifiedAt: string | null;
  lastWebhookAt: string | null;
};

export async function getMembershipSummary() {
  return apiCall<MembershipSummary>("/api/admin/membership-summary");
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
