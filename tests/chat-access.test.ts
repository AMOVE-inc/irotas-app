import { describe, expect, it } from "vitest";
import { CHAT_ROOMS } from "../constants/mock-data";
import { canAccessChatRoom } from "../lib/chat-access";
import { areFriends, getFriends } from "../lib/friendship";

describe("rank chat access", () => {
  it("does not provide a regular member room", () => {
    expect(CHAT_ROOMS.some((room) => room.id === "rank-regular")).toBe(false);
    expect(CHAT_ROOMS.filter((room) => room.type === "rank" && room.requiredRank === "regular")).toEqual([]);
  });

  it("shows exactly one room for the member's current rank", () => {
    expect(CHAT_ROOMS.filter((room) => room.type === "rank" && room.requiredRank === "gold").map((room) => room.id)).toEqual(["rank-gold"]);
  });

  it("does not let another rank open a rank room directly", () => {
    const goldRoom = CHAT_ROOMS.find((room) => room.id === "rank-gold");
    expect(goldRoom).toBeDefined();
    expect(canAccessChatRoom(goldRoom!, "u2", "platinum", true)).toBe(false);
    expect(canAccessChatRoom(goldRoom!, "u1", "gold")).toBe(true);
  });
});

describe("mutual friendship", () => {
  it("treats an approved friendship as mutual", () => {
    expect(areFriends("u1", "u2")).toBe(true);
    expect(areFriends("u2", "u1")).toBe(true);
  });

  it("does not expose non-friends as group invite candidates", () => {
    const friendIds = getFriends("u1").map((member) => member.id);
    expect(friendIds).toContain("u2");
    expect(friendIds).not.toContain("u5");
  });
});
