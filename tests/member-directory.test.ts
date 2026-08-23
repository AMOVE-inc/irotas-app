import { describe, expect, it } from "vitest";
import { publicMemberFromRow, sanitizeProfileUpdate } from "../sites/member-directory";

describe("member directory privacy", () => {
  it("returns public profile fields without email or billing identifiers", () => {
    const member = publicMemberFromRow({
      id: 12,
      public_member_id: "IRO0012",
      display_name: "テスト会員",
      access_role: "member",
      branches_json: '["kanto"]',
      member_term: "第2期",
      member_rank: "gold",
      achievement_badges_json: '["イベント大賞"]',
      discord_joined_at: "2024-02-01",
      profile_json: '{"bio":"よろしくお願いします"}',
      xp: 120,
      participation_count: 8,
      organizer_count: 2,
      created_at: "2024-01-01",
      subscription_started_at: "2024-01-15",
    });

    expect(member).toMatchObject({
      id: "IRO0012",
      displayName: "テスト会員",
      branches: ["kanto"],
      achievementBadges: ["イベント大賞"],
      joinedAt: "2024-01-15",
      profile: { bio: "よろしくお願いします" },
    });
    expect(member).not.toHaveProperty("email");
    expect(member).not.toHaveProperty("squareCustomerId");
    expect(member).not.toHaveProperty("discordUserId");
  });

  it("exposes only relationship state needed by member-facing screens", () => {
    const member = publicMemberFromRow({
      id: 12, public_member_id: "IRO0012", display_name: "友達", access_role: "member",
      branches_json: "[]", member_term: null, member_rank: "regular", achievement_badges_json: "[]",
      discord_joined_at: null, profile_json: "{}", xp: 0, participation_count: 0, organizer_count: 0,
      created_at: "2026-01-01", subscription_started_at: null, follower_count: 2, following_count: 3,
    }, { isFollowing: true, followsViewer: true });
    expect(member).toMatchObject({ followerCount: 2, followingCount: 3, isFollowing: true, followsViewer: true, isFriend: true });
  });
});

describe("member profile updates", () => {
  it("keeps only public profile fields and normalizes values", () => {
    expect(sanitizeProfileUpdate({
      displayName: "  Aoi  ",
      profile: {
        bio: " よろしくお願いします ",
        favoriteCuisines: ["寿司", "寿司", ""],
        showAge: true,
        avatarUrl: "/api/event-images/avatar.jpg",
        email: "private@example.com",
        squareCustomerId: "secret",
      },
    })).toEqual({
      displayName: "Aoi",
      profile: {
        bio: "よろしくお願いします",
        favoriteCuisines: ["寿司"],
        showAge: true,
        avatarUrl: "/api/event-images/avatar.jpg",
      },
    });
  });

  it("rejects invalid profile values", () => {
    expect(() => sanitizeProfileUpdate({ displayName: "", profile: {} })).toThrow();
    expect(() => sanitizeProfileUpdate({ displayName: "会員", profile: { showAge: "yes" } })).toThrow();
    expect(() => sanitizeProfileUpdate({ displayName: "会員", profile: { instagramUrl: "javascript:alert(1)" } })).toThrow();
  });
});
