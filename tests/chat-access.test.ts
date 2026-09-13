import { describe, expect, it } from "vitest";
import { CHAT_ROOMS } from "../constants/mock-data";
import { canAccessChatRoom, canAccessRankRoom } from "../lib/chat-access";
import { areFriends, getFriends } from "../lib/friendship";

describe("rank chat access", () => {
  it("does not provide a regular member room", () => {
    expect(CHAT_ROOMS.some((room) => room.id === "rank-regular")).toBe(false);
    expect(CHAT_ROOMS.filter((room) => room.type === "rank" && room.requiredRank === "regular")).toEqual([]);
  });

  it("shows the current rank and lower rank rooms", () => {
    const visible = (rank: string) => CHAT_ROOMS.filter((room) => room.type === "rank" && canAccessRankRoom(rank, room.requiredRank)).map((room) => room.id);
    expect(visible("regular")).toEqual([]);
    expect(visible("silver")).toEqual(["rank-silver"]);
    expect(visible("gold")).toEqual(["rank-silver", "rank-gold"]);
    expect(visible("platinum")).toEqual(["rank-silver", "rank-gold", "rank-platinum"]);
  });

  it("lets higher ranks enter lower rooms but rejects lower and unknown ranks", () => {
    const goldRoom = CHAT_ROOMS.find((room) => room.id === "rank-gold");
    expect(goldRoom).toBeDefined();
    expect(canAccessChatRoom(goldRoom!, "u2", "platinum")).toBe(true);
    expect(canAccessChatRoom(goldRoom!, "u1", "gold")).toBe(true);
    expect(canAccessChatRoom(goldRoom!, "u3", "silver")).toBe(false);
    expect(canAccessRankRoom("unknown", "silver")).toBe(false);
    expect(canAccessRankRoom("platinum", "unknown")).toBe(false);
  });
});

describe("club chat access", () => {
  it("allows staff to view non-member club chats while ordinary members need approval", () => {
    const room = {
      id: "club-chat-club-travel", name: "旅行部チャット", type: "club" as const,
      sourceId: "club-travel", participants: ["IRO0009"], createdBy: "system",
    };
    expect(canAccessChatRoom(room, "IRO0009", "regular")).toBe(true);
    expect(canAccessChatRoom(room, "IRO0011", "regular")).toBe(false);
    expect(canAccessChatRoom(room, "IRO0011", "regular", true)).toBe(true);
  });
});

describe("staff chat oversight", () => {
  it("allows staff to view a DM without joining it", () => {
    const room = { id: "dm-private", name: "DM", type: "dm" as const, sourceId: "dm-private", participants: ["IRO0010", "IRO0011"], createdBy: "IRO0010" };
    expect(canAccessChatRoom(room, "IRO0009", "regular")).toBe(false);
    expect(canAccessChatRoom(room, "IRO0009", "regular", true)).toBe(true);
  });
});

describe("community free chat access", () => {
  it("allows a member without explicit room participation", () => {
    const room = { id: "community-free-chat", name: "フリーチャット", type: "board" as const, sourceId: "community-free-chat", participants: [], createdBy: "system" };
    expect(canAccessChatRoom(room, "IRO0009", "regular")).toBe(true);
    expect(canAccessChatRoom({ ...room, id: "legacy-free-room" }, "IRO0009", "regular")).toBe(true);
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
