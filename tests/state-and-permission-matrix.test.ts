import { describe, expect, it } from "vitest";
import {
  canCreateClub,
  canCreateClubEvent,
  canManageBoardCategories,
  canManageGourmetContests,
  canPostToChat,
  canViewClubEvent,
  canViewClubThread,
  isAdminRole,
  isOperatorRole,
} from "../lib/access-control";
import { canAccessMemberApp, canBypassSubscription } from "../lib/membership-access";
import { canAccessChatRoom } from "../lib/chat-access";
import type { ChatRoom } from "../constants/mock-data";

const roles = [
  { name: "member", role: "user", accessRole: "member" },
  { name: "club leader", role: "user", accessRole: "club_leader" },
  { name: "operator", role: "operator", accessRole: "operator" },
  { name: "admin", role: "admin", accessRole: "admin" },
] as const;

function room(input: Pick<ChatRoom, "id" | "name" | "type" | "participants"> & Partial<ChatRoom>): ChatRoom {
  return { sourceId: input.id, createdBy: "IRO0000", ...input };
}

describe("permission star matrix", () => {
  it.each(roles)("fails closed and applies global management permissions for $name", ({ role, accessRole, name }) => {
    const admin = name === "admin";
    const elevated = name === "operator" || admin;
    expect(isAdminRole(role, accessRole)).toBe(admin);
    expect(isOperatorRole(role, accessRole)).toBe(elevated);
    expect(canManageBoardCategories(role, accessRole)).toBe(admin);
    expect(canCreateClub(role, accessRole)).toBe(admin);
    expect(canManageGourmetContests(role, accessRole)).toBe(elevated);
    expect(canPostToChat(role, "board-announcement", accessRole)).toBe(elevated);
    expect(canPostToChat(role, "ordinary-room", accessRole)).toBe(true);
  });

  it("limits club content to approved members, leaders through membership, operators, and admins", () => {
    const approved = ["member-approved"];
    expect(canViewClubThread("user", "member-other", approved, "member")).toBe(false);
    expect(canViewClubThread("user", "member-approved", approved, "member")).toBe(true);
    expect(canViewClubEvent("operator", "member-other", approved, "operator")).toBe(true);
    expect(canViewClubEvent("admin", "member-other", approved, "admin")).toBe(true);
    expect(canCreateClubEvent("member-other", approved, "leader")).toBe(false);
    expect(canCreateClubEvent("member-approved", approved, "leader")).toBe(true);
    expect(canCreateClubEvent("leader", approved, "leader")).toBe(true);
  });

  it("enforces subscription access states and only permits explicit role bypasses", () => {
    expect(canAccessMemberApp({ squareStatus: "ACTIVE", accessStatus: "active" })).toBe(true);
    expect(canAccessMemberApp({ squareStatus: "ACTIVE", accessStatus: "pending" })).toBe(false);
    expect(canAccessMemberApp({ squareStatus: "PAUSED", accessStatus: "suspended" })).toBe(false);
    expect(canAccessMemberApp({ squareStatus: "ACTIVE", accessStatus: "grace", graceUntilDate: "2099-01-01" })).toBe(true);
    expect(canAccessMemberApp({ squareStatus: "ACTIVE", accessStatus: "grace", graceUntilDate: "2000-01-01" })).toBe(false);
    expect(canBypassSubscription("user", "member")).toBe(false);
    for (const accessRole of ["club_leader", "operator", "admin"] as const) expect(canBypassSubscription("user", accessRole)).toBe(true);
  });

  it("prevents room access from leaking across DM, group, club, and rank boundaries", () => {
    const member = "IRO0001";
    expect(canAccessChatRoom(room({ id: "dm", name: "DM", type: "dm", participants: [member, "IRO0002"] }), member, "regular")).toBe(true);
    expect(canAccessChatRoom(room({ id: "dm", name: "DM", type: "dm", participants: ["IRO0002"] }), member, "regular")).toBe(false);
    expect(canAccessChatRoom(room({ id: "group", name: "Group", type: "group", participants: [member] }), member, "regular")).toBe(true);
    expect(canAccessChatRoom(room({ id: "club", name: "Club", type: "club", participants: ["IRO0002"] }), member, "regular")).toBe(false);
    expect(canAccessChatRoom(room({ id: "rank", name: "Rank", type: "rank", participants: [], requiredRank: "gold" }), member, "silver")).toBe(false);
    expect(canAccessChatRoom(room({ id: "rank", name: "Rank", type: "rank", participants: [], requiredRank: "gold" }), member, "platinum")).toBe(true);
    expect(canAccessChatRoom(room({ id: "private", name: "Private", type: "dm", participants: [member] }), member, "regular", true)).toBe(true);
  });
});
