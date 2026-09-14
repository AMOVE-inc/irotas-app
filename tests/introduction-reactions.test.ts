import { describe, expect, it } from "vitest";
import { importedIntroductionReactions, isUnidentifiedReaction, mergedIntroductionReactions } from "../lib/introduction-reactions";

describe("Discord introduction reactions", () => {
  it("restores aggregate stamp counts and keeps the cracker default", () => {
    const reactions = importedIntroductionReactions("post-1", { "🎉": { count: 5, users: null }, "❤️": ["123"] });
    expect(reactions["🎉"]).toHaveLength(5);
    expect(reactions["❤️"]).toEqual(["discord-123"]);
    expect(importedIntroductionReactions("post-2", null)["🎉"]).toHaveLength(1);
  });
  it("keeps archive counts while adding persisted members without inventing identities", () => {
    const archived = importedIntroductionReactions("post-1", { "🎉": { count: 2, users: null } });
    const merged = mergedIntroductionReactions(archived, { "🎉": ["IRO-123"], "❤️": ["IRO-456"] });
    expect(merged["🎉"]).toHaveLength(3);
    expect(merged["🎉"].filter(isUnidentifiedReaction)).toHaveLength(2);
    expect(merged["🎉"]).toContain("IRO-123");
    expect(merged["❤️"]).toEqual(["IRO-456"]);
  });
});
