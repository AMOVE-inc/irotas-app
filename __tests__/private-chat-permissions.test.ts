import { describe, expect, it } from "vitest";

import { canInviteWithoutMutualFollow, isPrivateChatStaff } from "../lib/private-chat-permissions";

describe("private chat staff exemptions", () => {
  it("recognizes operator and administrator roles from both role columns", () => {
    expect(isPrivateChatStaff({ role: "operator" })).toBe(true);
    expect(isPrivateChatStaff({ accessRole: "admin" })).toBe(true);
    expect(isPrivateChatStaff({ access_role: "operator" })).toBe(true);
    expect(isPrivateChatStaff({ role: "user", accessRole: "member" })).toBe(false);
  });

  it("allows either side of a private chat invitation to be staff", () => {
    const member = { role: "user", accessRole: "member" };
    expect(canInviteWithoutMutualFollow({ role: "operator" }, member)).toBe(true);
    expect(canInviteWithoutMutualFollow(member, { accessRole: "admin" })).toBe(true);
    expect(canInviteWithoutMutualFollow(member, member)).toBe(false);
  });
});
