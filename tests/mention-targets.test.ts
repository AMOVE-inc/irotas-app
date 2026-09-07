import { describe, expect, it } from "vitest";
import { findMentionedClub, findMentionedMemberId } from "../lib/mention-targets";

describe("event mention targets", () => {
  it("resolves a member and a club mention with an emoji suffix", () => {
    expect(findMentionedMemberId("@Hono", [{ id: "IRO0189", displayName: "Hono" }])).toBe("IRO0189");
    expect(findMentionedClub("ディズニー部🐭", [{ id: "club-disney", name: "ディズニー部" }])?.id).toBe("club-disney");
  });

  it("leaves missing or deleted targets unresolved", () => {
    expect(findMentionedMemberId("退会済み", [])).toBeUndefined();
    expect(findMentionedClub("削除済み部", [])).toBeUndefined();
  });
});
