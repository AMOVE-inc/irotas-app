export type UserRole = "user" | "operator" | "admin";
export type AccessRole = "member" | "club_leader" | "operator" | "admin";
export type BranchRole = "kanto" | "kansai";

/** 集計・会員情報まで横断して扱うダッシュボードは管理者だけに限定する。 */
const ADMIN_ROUTE_NAMES = new Set(["admin-dashboard"]);

/**
 * 日常運用の管理画面は、管理者と運営メンバーに個別に開放する。
 * ダッシュボードを経由しなくても各画面へ安全にアクセスできるようにする。
 */
const OPERATOR_ROUTE_NAMES = new Set([
  "coupon-manager",
  "campaign-manager",
  "gift-campaign-manager",
  "csv-import",
]);

/** Unknown or missing role values must always fail closed. */
export function normalizeUserRole(role: unknown): UserRole {
  return role === "admin" || role === "operator" ? role : "user";
}

/** Detailed operational role stored on the member record. Unknown values fail closed. */
export function normalizeAccessRole(role: unknown): AccessRole {
  return role === "admin" || role === "operator" || role === "club_leader" ? role : "member";
}

export function normalizeBranchRole(branch: unknown): BranchRole | null {
  return branch === "kanto" || branch === "kansai" ? branch : null;
}

export function normalizeBranchRoles(branches: unknown, fallback?: unknown): BranchRole[] {
  const values = Array.isArray(branches) ? branches : [];
  const normalized = values
    .map(normalizeBranchRole)
    .filter((branch): branch is BranchRole => branch !== null);
  const fallbackBranch = normalizeBranchRole(fallback);
  if (fallbackBranch) normalized.push(fallbackBranch);
  return [...new Set(normalized)];
}

export function isAdminRole(role: unknown, accessRole?: unknown): boolean {
  return normalizeUserRole(role) === "admin" || normalizeAccessRole(accessRole) === "admin";
}

/** 運営作業は管理者と運営メンバーが実行できる。管理画面は引き続き管理者専用。 */
export function isOperatorRole(role: unknown, accessRole?: unknown): boolean {
  const normalized = normalizeUserRole(role);
  const detailed = normalizeAccessRole(accessRole);
  return normalized === "admin" || normalized === "operator" || detailed === "admin" || detailed === "operator";
}

export function isClubLeaderRole(accessRole: unknown): boolean {
  return normalizeAccessRole(accessRole) === "club_leader";
}

export function isAdminRoute(route: unknown): boolean {
  return typeof route === "string" && ADMIN_ROUTE_NAMES.has(route);
}

export function isOperatorRoute(route: unknown): boolean {
  return typeof route === "string" && OPERATOR_ROUTE_NAMES.has(route);
}

/** Board category creation is an application-wide management action. */
export function canManageBoardCategories(role: unknown, accessRole?: unknown): boolean {
  return isAdminRole(role, accessRole);
}

/** グルメ選手権の作成・編集は管理者と運営メンバーに限定する。 */
export function canManageGourmetContests(role: unknown, accessRole?: unknown): boolean {
  return isOperatorRole(role, accessRole);
}

/** New clubs affect the whole community and may only be created by administrators. */
export function canCreateClub(role: unknown, accessRole?: unknown): boolean {
  return isAdminRole(role, accessRole);
}

/** Approved members and staff can read club threads. */
export function canViewClubThread(role: unknown, memberId: string, approvedMemberIds: string[], accessRole?: unknown): boolean {
  return isOperatorRole(role, accessRole) || approvedMemberIds.includes(memberId);
}

/** 部活イベントは所属部員と運営・管理者が閲覧できる。 */
export function canViewClubEvent(role: unknown, memberId: string, approvedMemberIds: string[], accessRole?: unknown): boolean {
  return isOperatorRole(role, accessRole) || approvedMemberIds.includes(memberId);
}

/** 部活イベントを登録できるのは承認済み部員または部長のみ。 */
export function canCreateClubEvent(memberId: string, approvedMemberIds: string[], leaderId: string): boolean {
  return memberId === leaderId || approvedMemberIds.includes(memberId);
}

/** 運営アナウンスは運営からの送信専用。他のチャットは通常どおり送信できる。 */
export function canPostToChat(role: unknown, roomId: string, accessRole?: unknown): boolean {
  return roomId !== "board-announcement" || isOperatorRole(role, accessRole);
}
