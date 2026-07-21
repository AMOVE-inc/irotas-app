import { describe, expect, it } from "vitest";

import {
  canManageBoardCategories,
  canCreateClub,
  isAdminRole,
  isAdminRoute,
  normalizeBranchRole,
  normalizeUserRole,
} from "../lib/access-control";

describe("access control", () => {
  it("accepts only the exact admin role", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("user")).toBe(false);
    expect(isAdminRole("ADMIN")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });

  it("normalizes unknown role values to a regular user", () => {
    expect(normalizeUserRole("admin")).toBe("admin");
    expect(normalizeUserRole("member")).toBe("user");
    expect(normalizeUserRole(null)).toBe("user");
  });

  it("accepts only supported branch roles", () => {
    expect(normalizeBranchRole("kanto")).toBe("kanto");
    expect(normalizeBranchRole("kansai")).toBe("kansai");
    expect(normalizeBranchRole("admin")).toBeNull();
    expect(normalizeBranchRole(undefined)).toBeNull();
  });

  it.each(["admin-dashboard", "campaign-manager", "csv-import", "create-event"])(
    "marks %s as an admin-only route",
    (route) => {
      expect(isAdminRoute(route)).toBe(true);
    },
  );

  it("keeps member routes outside the admin-only set", () => {
    expect(isAdminRoute("profile")).toBe(false);
    expect(isAdminRoute("events")).toBe(false);
    expect(isAdminRoute(undefined)).toBe(false);
  });

  it("allows only administrators to add board categories", () => {
    expect(canManageBoardCategories("admin")).toBe(true);
    expect(canManageBoardCategories("user")).toBe(false);
    expect(canManageBoardCategories("member")).toBe(false);
    expect(canManageBoardCategories(undefined)).toBe(false);
  });

  it("allows only administrators to create clubs", () => {
    expect(canCreateClub("admin")).toBe(true);
    expect(canCreateClub("user")).toBe(false);
    expect(canCreateClub("member")).toBe(false);
    expect(canCreateClub(undefined)).toBe(false);
  });
});
