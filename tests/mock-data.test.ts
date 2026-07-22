import { describe, it, expect } from "vitest";
import {
  ANNOUNCEMENTS,
  TIMELINE_POSTS,
  EVENTS,
  RESTAURANTS,
  BOARD_THREADS,
  BOARD_CATEGORIES,
  CLUBS,
  COUPONS,
  CURRENT_USER,
  RANK_LABELS,
  RANK_COLORS,
} from "../constants/mock-data";

describe("Mock Data Integrity", () => {
  it("should have announcements with required fields", () => {
    expect(ANNOUNCEMENTS.length).toBeGreaterThan(0);
    for (const a of ANNOUNCEMENTS) {
      expect(a.id).toBeDefined();
      expect(a.title).toBeDefined();
      expect(a.content).toBeDefined();
    }
  });

  it("should have timeline posts with required fields", () => {
    expect(TIMELINE_POSTS.length).toBeGreaterThan(0);
    for (const p of TIMELINE_POSTS) {
      expect(p.id).toBeDefined();
      expect(p.author).toBeDefined();
      expect(p.author.name).toBeDefined();
      expect(p.content).toBeDefined();
      expect(p.likes).toBeGreaterThanOrEqual(0);
      expect(p.comments).toBeGreaterThanOrEqual(0);
    }
  });

  it("should have events with required fields", () => {
    expect(EVENTS.length).toBeGreaterThan(0);
    for (const e of EVENTS) {
      expect(e.id).toBeDefined();
      expect(e.title).toBeDefined();
      expect(e.date).toBeDefined();
      expect(e.location).toBeDefined();
      expect(["official", "gourmet"]).toContain(e.eventType);
      expect(["open", "full", "closed"]).toContain(e.status);
      expect(e.capacity).toBeGreaterThan(0);
      expect(e.attendees).toBeLessThanOrEqual(e.capacity);
    }
  });

  it("should have restaurants with required fields", () => {
    expect(RESTAURANTS.length).toBeGreaterThan(0);
    for (const r of RESTAURANTS) {
      expect(r.id).toBeDefined();
      expect(r.name).toBeDefined();
      expect(r.genre).toBeDefined();
      expect(r.address).toBeDefined();
      expect(r.latitude).toBeGreaterThan(0);
      expect(r.longitude).toBeGreaterThan(0);
      expect(r.rating).toBeGreaterThanOrEqual(0);
      expect(r.rating).toBeLessThanOrEqual(5);
    }
  });

  it("should have board threads with required fields", () => {
    expect(BOARD_THREADS.length).toBeGreaterThan(0);
    for (const t of BOARD_THREADS) {
      expect(t.id).toBeDefined();
      expect(t.title).toBeDefined();
      expect(t.category).toBeDefined();
      expect(t.commentCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("should expose the requested board categories and split clubs", () => {
    const labels = BOARD_CATEGORIES.map((category) => category.label);

    expect(labels).toEqual([
      "今日のごちそうさま報告",
      "教えてグルメ相談室",
      "なんでも掲示板",
      "関東",
      "関西",
      "今月の部活動レポート",
      "ラーメン部",
      "ワイン部",
      "スイーツ部",
      "料理部",
    ]);
    expect(BOARD_CATEGORIES.map((category) => category.group)).toEqual([
      "all", "all", "all", "area", "area", "club", "club", "club", "club", "club",
    ]);
    expect(labels).not.toContain("関東グルメ");
    expect(labels).not.toContain("関西グルメ");
  });

  it("should have coupons with required fields", () => {
    expect(COUPONS.length).toBeGreaterThan(0);
    for (const c of COUPONS) {
      expect(c.id).toBeDefined();
      expect(c.title).toBeDefined();
      expect(c.discount).toBeDefined();
      expect(c.code).toBeDefined();
      expect(["regular", "silver", "gold", "platinum"]).toContain(c.requiredRank);
    }
  });

  it("should have current user with valid rank", () => {
    expect(CURRENT_USER.name).toBeDefined();
    expect(["silver", "gold", "platinum"]).toContain(CURRENT_USER.rank);
    expect(CURRENT_USER.branch).toBeDefined();
  });

  it("should keep structured club applications for leader review", () => {
    const applications = CLUBS.flatMap((club) => club.applications);
    expect(applications.length).toBeGreaterThan(0);
    for (const application of applications) {
      expect(application.wantsToDo.trim().length).toBeGreaterThan(0);
      expect(application.messageToLeader.trim().length).toBeGreaterThan(0);
      expect(["pending", "on_hold"]).toContain(application.status);
    }
  });

  it("should have rank labels for all ranks", () => {
    expect(RANK_LABELS.silver).toBe("シルバー");
    expect(RANK_LABELS.gold).toBe("ゴールド");
    expect(RANK_LABELS.platinum).toBe("プラチナ");
  });

  it("should have rank colors for all ranks", () => {
    expect(RANK_COLORS.silver).toBeDefined();
    expect(RANK_COLORS.gold).toBeDefined();
    expect(RANK_COLORS.platinum).toBeDefined();
  });
});

describe("Event filtering", () => {
  it("should have events with category field", () => {
    for (const e of EVENTS) {
      expect(["all", "kanto", "kansai"]).toContain(e.category);
    }
  });

  it("should filter events by category", () => {
    const kantoEvents = EVENTS.filter(
      (e) => e.category === "kanto" || e.category === "all"
    );
    expect(kantoEvents.length).toBeGreaterThan(0);
  });
});

describe("Restaurant filtering", () => {
  it("should have restaurants with genre field for filtering", () => {
    const genres = new Set(RESTAURANTS.map((r) => r.genre));
    expect(genres.size).toBeGreaterThan(1);
  });
});
