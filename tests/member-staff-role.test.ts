import { describe, expect, it } from "vitest";
import { getMemberStaffRole, shouldShowMemberRank } from "../lib/member-staff-role";

describe("staff rank-badge policy", () => {
  it("hides regular-rank badges for administrators and operators", () => {
    expect(getMemberStaffRole("Non【IRO+代表】")).toBe("admin");
    expect(getMemberStaffRole("723【運営】")).toBe("operator");
    expect(shouldShowMemberRank("723【運営】")).toBe(false);
    expect(shouldShowMemberRank("一般会員")).toBe(true);
  });
});
