export type UserRole = "user" | "operator" | "admin";
export type BranchRole = "kanto" | "kansai";

const ADMIN_ROUTE_NAMES = new Set([
  "admin-dashboard",
  "csv-import",
]);
const OPERATOR_ROUTE_NAMES = new Set(["campaign-manager", "gift-campaign-manager"]);

/** Unknown or missing role values must always fail closed. */
export function normalizeUserRole(role: unknown): UserRole {
  return role === "admin" || role === "operator" ? role : "user";
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

export function isAdminRole(role: unknown): boolean {
  return normalizeUserRole(role) === "admin";
}

/** 運営作業は管理者と運営メンバーが実行できる。管理画面は引き続き管理者専用。 */
export function isOperatorRole(role: unknown): boolean {
  const normalized = normalizeUserRole(role);
  return normalized === "admin" || normalized === "operator";
}

export function isAdminRoute(route: unknown): boolean {
  return typeof route === "string" && ADMIN_ROUTE_NAMES.has(route);
}

export function isOperatorRoute(route: unknown): boolean {
  return typeof route === "string" && OPERATOR_ROUTE_NAMES.has(route);
}

/** Board category creation is an application-wide management action. */
export function canManageBoardCategories(role: unknown): boolean {
  return isAdminRole(role);
}

/** グルメ選手権の作成・編集は管理者と運営メンバーに限定する。 */
export function canManageGourmetContests(role: unknown): boolean {
  return isOperatorRole(role);
}

/** New clubs affect the whole community and may only be created by administrators. */
export function canCreateClub(role: unknown): boolean {
  return isAdminRole(role);
}

/** Club threads are private to approved members, with administrator access for moderation. */
export function canViewClubThread(role: unknown, memberId: string, approvedMemberIds: string[]): boolean {
  return isAdminRole(role) || approvedMemberIds.includes(memberId);
}

/** 部活イベントの詳細は所属部員のみ。管理者は安全管理のため閲覧できる。 */
export function canViewClubEvent(role: unknown, memberId: string, approvedMemberIds: string[]): boolean {
  return isAdminRole(role) || approvedMemberIds.includes(memberId);
}
