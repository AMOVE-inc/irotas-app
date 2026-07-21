export type UserRole = "user" | "admin";
export type BranchRole = "kanto" | "kansai";

const ADMIN_ROUTE_NAMES = new Set([
  "admin-dashboard",
  "campaign-manager",
  "csv-import",
  "create-event",
]);

/** Unknown or missing role values must always fail closed. */
export function normalizeUserRole(role: unknown): UserRole {
  return role === "admin" ? "admin" : "user";
}

export function normalizeBranchRole(branch: unknown): BranchRole | null {
  return branch === "kanto" || branch === "kansai" ? branch : null;
}

export function isAdminRole(role: unknown): boolean {
  return normalizeUserRole(role) === "admin";
}

export function isAdminRoute(route: unknown): boolean {
  return typeof route === "string" && ADMIN_ROUTE_NAMES.has(route);
}

/** Board category creation is an application-wide management action. */
export function canManageBoardCategories(role: unknown): boolean {
  return isAdminRole(role);
}

/** New clubs affect the whole community and may only be created by administrators. */
export function canCreateClub(role: unknown): boolean {
  return isAdminRole(role);
}
