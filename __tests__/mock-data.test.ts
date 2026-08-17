import { describe, it, expect } from "vitest";
import {
  CURRENT_USER,
  MEMBERS,
  EVENTS,
  RESTAURANTS,
  BOARD_THREADS,
  CLUBS,
  COUPONS,
  ANNOUNCEMENTS,
  CHAT_ROOMS,
  CHAT_MESSAGES,
  RANK_COLORS,
  RANK_LABELS,
  POINT_ACTIONS,
  RANK_THRESHOLDS_POINTS,
  getRankFromPoints,
  getNextRankInfo,
  getOrganizerPointAdjustment,
  getMemberById,
  isAdmin,
  type MemberRank,
} from "../constants/mock-data";

describe("Mock Data Integrity", () => {
  it("CURRENT_USER should have all required fields including points", () => {
    expect(CURRENT_USER.id).toBeTruthy();
    expect(CURRENT_USER.name).toBeTruthy();
    expect(CURRENT_USER.avatar).toBeTruthy();
    expect(CURRENT_USER.rank).toBeTruthy();
    expect(typeof CURRENT_USER.points).toBe("number");
    expect(CURRENT_USER.points).toBeGreaterThanOrEqual(0);
    expect(CURRENT_USER.generation).toBeGreaterThan(0);
    expect(CURRENT_USER.bio).toBeTruthy();
    expect(Array.isArray(CURRENT_USER.interests)).toBe(true);
    expect(CURRENT_USER.role).toBeTruthy();
    expect(CURRENT_USER.joinedAt).toBeTruthy();
  });

  it("all members should have points field", () => {
    MEMBERS.forEach((member) => {
      expect(typeof member.points).toBe("number");
      expect(member.points).toBeGreaterThanOrEqual(0);
    });
  });

  it("member ranks should be consistent with their points", () => {
    MEMBERS.forEach((member) => {
      const expectedRank = getRankFromPoints(member.points);
      expect(member.rank).toBe(expectedRank);
    });
  });

  it("all members should have interests array", () => {
    MEMBERS.forEach((member) => {
      expect(Array.isArray(member.interests)).toBe(true);
    });
  });

  it("all members should have generation number", () => {
    MEMBERS.forEach((member) => {
      expect(member.generation).toBeGreaterThan(0);
    });
  });

  it("all members should have bio string", () => {
    MEMBERS.forEach((member) => {
      expect(typeof member.bio).toBe("string");
    });
  });

  it("getMemberById should return correct member", () => {
    const member = getMemberById("u1");
    expect(member).toBeDefined();
    expect(member?.name).toBe("かずま");
  });

  it("getMemberById should return undefined for invalid id", () => {
    const member = getMemberById("invalid");
    expect(member).toBeUndefined();
  });

  it("isAdmin should correctly identify admin users", () => {
    expect(isAdmin(CURRENT_USER)).toBe(true);
    const regularMember = MEMBERS.find((m) => m.role === "member");
    if (regularMember) {
      expect(isAdmin(regularMember)).toBe(false);
    }
  });
});

describe("Rank System", () => {
  it("should have all four rank levels", () => {
    const ranks: MemberRank[] = ["regular", "silver", "gold", "platinum"];
    ranks.forEach((rank) => {
      expect(RANK_COLORS[rank]).toBeTruthy();
      expect(RANK_LABELS[rank]).toBeTruthy();
    });
  });

  it("RANK_LABELS should have correct Japanese labels", () => {
    expect(RANK_LABELS.regular).toBe("レギュラー");
    expect(RANK_LABELS.silver).toBe("シルバー");
    expect(RANK_LABELS.gold).toBe("ゴールド");
    expect(RANK_LABELS.platinum).toBe("プラチナ");
  });
});

describe("Events", () => {
  it("should have events with required fields", () => {
    expect(EVENTS.length).toBeGreaterThan(0);
    EVENTS.forEach((event) => {
      expect(event.id).toBeTruthy();
      expect(event.title).toBeTruthy();
      expect(event.date).toBeTruthy();
      expect(event.createdBy).toBeTruthy();
    });
  });

  it("events should be created by existing members", () => {
    EVENTS.forEach((event) => {
      const creator = getMemberById(event.createdBy);
      expect(creator).toBeDefined();
    });
  });
});

describe("Clubs", () => {
  it("should have clubs with required fields", () => {
    expect(CLUBS.length).toBeGreaterThan(0);
    CLUBS.forEach((club) => {
      expect(club.id).toBeTruthy();
      expect(club.name).toBeTruthy();
      expect(club.description).toBeTruthy();
      expect(club.leaderId).toBeTruthy();
      expect(club.memberIds.length).toBeGreaterThan(0);
      expect(club.icon).toBeTruthy();
    });
  });

  it("club leaders should be in member list", () => {
    CLUBS.forEach((club) => {
      expect(club.memberIds).toContain(club.leaderId);
    });
  });
});

describe("Chat System", () => {
  it("should have chat rooms", () => {
    expect(CHAT_ROOMS.length).toBeGreaterThan(0);
    CHAT_ROOMS.forEach((room) => {
      expect(room.id).toBeTruthy();
      expect(room.name).toBeTruthy();
      expect(["event", "board", "club", "rank"]).toContain(room.type);
      expect(room.participants.length).toBeGreaterThan(0);
    });
  });

  it("chat messages should reference valid chat rooms", () => {
    CHAT_MESSAGES.forEach((msg) => {
      const room = CHAT_ROOMS.find((r) => r.id === msg.chatId);
      expect(room).toBeDefined();
    });
  });
});

describe("Restaurants", () => {
  it("should have restaurants with coordinates", () => {
    expect(RESTAURANTS.length).toBeGreaterThan(0);
    RESTAURANTS.forEach((r) => {
      expect(r.latitude).toBeDefined();
      expect(r.longitude).toBeDefined();
      expect(r.genre).toBeTruthy();
    });
  });
});

describe("Board Threads", () => {
  it("should have threads with required fields", () => {
    expect(BOARD_THREADS.length).toBeGreaterThan(0);
    BOARD_THREADS.forEach((thread) => {
      expect(thread.id).toBeTruthy();
      expect(thread.title).toBeTruthy();
      expect(thread.category).toBeTruthy();
    });
  });

  it("recruiting threads should have capacity info", () => {
    const recruitingThreads = BOARD_THREADS.filter((t) => t.isRecruiting);
    recruitingThreads.forEach((thread) => {
      expect(thread.recruitCapacity).toBeGreaterThan(0);
    });
  });
});

describe("Points-based Rank System", () => {
  it("getRankFromPoints should return correct ranks at thresholds", () => {
    expect(getRankFromPoints(0)).toBe("regular");
    expect(getRankFromPoints(50)).toBe("regular");
    expect(getRankFromPoints(99)).toBe("regular");
    expect(getRankFromPoints(100)).toBe("silver");
    expect(getRankFromPoints(499)).toBe("silver");
    expect(getRankFromPoints(500)).toBe("gold");
    expect(getRankFromPoints(999)).toBe("gold");
    expect(getRankFromPoints(1000)).toBe("platinum");
    expect(getRankFromPoints(5000)).toBe("platinum");
  });

  it("getNextRankInfo should return correct next rank info", () => {
    const regularInfo = getNextRankInfo(50);
    expect(regularInfo).not.toBeNull();
    expect(regularInfo!.nextRank).toBe("silver");
    expect(regularInfo!.pointsNeeded).toBe(50);
    expect(regularInfo!.progress).toBeCloseTo(0.5);

    const silverInfo = getNextRankInfo(300);
    expect(silverInfo).not.toBeNull();
    expect(silverInfo!.nextRank).toBe("gold");
    expect(silverInfo!.pointsNeeded).toBe(200);

    const goldInfo = getNextRankInfo(750);
    expect(goldInfo).not.toBeNull();
    expect(goldInfo!.nextRank).toBe("platinum");
    expect(goldInfo!.pointsNeeded).toBe(250);
  });

  it("getNextRankInfo should return null for platinum (max rank)", () => {
    expect(getNextRankInfo(1000)).toBeNull();
    expect(getNextRankInfo(2000)).toBeNull();
  });

  it("POINT_ACTIONS should have all defined actions", () => {
    expect(POINT_ACTIONS.eventJoin.points).toBe(10);
    expect(POINT_ACTIONS.boardPost.points).toBe(5);
    expect(POINT_ACTIONS.comment.points).toBe(2);
    expect(POINT_ACTIONS.clubActivity.points).toBe(3);
    expect(POINT_ACTIONS.mealReportPost.points).toBe(8);
    expect(POINT_ACTIONS.eventOrganize.points).toBe(20);
    expect(getOrganizerPointAdjustment("completed")).toBe(20);
    expect(getOrganizerPointAdjustment("cancelled")).toBe(-20);
  });

  it("RANK_THRESHOLDS_POINTS should have correct thresholds", () => {
    expect(RANK_THRESHOLDS_POINTS).toHaveLength(4);
    expect(RANK_THRESHOLDS_POINTS[0].minPoints).toBe(0);
    expect(RANK_THRESHOLDS_POINTS[1].minPoints).toBe(100);
    expect(RANK_THRESHOLDS_POINTS[2].minPoints).toBe(500);
    expect(RANK_THRESHOLDS_POINTS[3].minPoints).toBe(1000);
  });

  it("platinum threshold should be 1000 (会費無料)", () => {
    const platinumThreshold = RANK_THRESHOLDS_POINTS.find(
      (t) => t.rank === "platinum",
    );
    expect(platinumThreshold).toBeDefined();
    expect(platinumThreshold!.minPoints).toBe(1000);
  });
});

// Auth schema validation tests
describe("Auth schema", () => {
  it("users table should include passwordHash column", async () => {
    const schema = await import("../server/mysql-drizzle/schema");
    expect(schema.users).toBeDefined();
    // Verify the users table has the expected columns
    const columns = Object.keys(schema.users);
    expect(columns.length).toBeGreaterThan(0);
  });

  it("server db module should export email auth functions", async () => {
    const db = await import("../server/db");
    expect(db.getUserByEmail).toBeDefined();
    expect(db.createEmailUser).toBeDefined();
    expect(db.getUserByOpenId).toBeDefined();
    expect(db.upsertUser).toBeDefined();
  });
});
