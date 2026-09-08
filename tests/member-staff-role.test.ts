import { describe, expect, it } from "vitest";
import { getMemberStaffRole, shouldShowMemberRank } from "../lib/member-staff-role";

describe("staff rank-badge policy", () => {
  it("shows rank badges only for elevated membership ranks", () => {
    expect(getMemberStaffRole("Non【IRO+代表】")).toBe("admin");
    expect(getMemberStaffRole("723【運営】")).toBe("operator");
    expect(shouldShowMemberRank("regular", "723【運営】")).toBe(false);
    expect(shouldShowMemberRank("regular", "一般会員")).toBe(false);
    expect(shouldShowMemberRank("gold", "一般会員")).toBe(true);
  });
});
