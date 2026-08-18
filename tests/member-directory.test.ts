import { describe, expect, it } from "vitest";
import { publicMemberFromRow } from "../sites/member-directory";

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
});
