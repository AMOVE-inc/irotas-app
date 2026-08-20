import { describe, expect, it } from "vitest";
import { isStrictAdmin, normalizeMemberTerm } from "../sites/operator-management";

describe("operator member management", () => {
  it("allows only administrators", () => {
    expect(isStrictAdmin({ role: "admin", access_role: "admin" })).toBe(true);
    expect(isStrictAdmin({ role: "user", access_role: "admin" })).toBe(true);
    expect(isStrictAdmin({ role: "operator", access_role: "operator" })).toBe(false);
  });

  it("normalizes valid member terms and permits clearing", () => {
    expect(normalizeMemberTerm("第1期")).toBe("第1期");
    expect(normalizeMemberTerm(" 第12期 ")).toBe("第12期");
    expect(normalizeMemberTerm(null)).toBeNull();
    expect(normalizeMemberTerm("")).toBeNull();
  });

  it("rejects invalid member terms", () => {
    expect(normalizeMemberTerm("第0期")).toBeUndefined();
    expect(normalizeMemberTerm("第100期")).toBeUndefined();
    expect(normalizeMemberTerm("1期")).toBeUndefined();
  });
});
