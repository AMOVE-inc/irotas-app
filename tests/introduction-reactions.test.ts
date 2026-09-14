import { describe, expect, it } from "vitest";
import { importedIntroductionReactions } from "../lib/introduction-reactions";

describe("Discord introduction reactions", () => {
  it("restores aggregate stamp counts and keeps the cracker default", () => {
    const reactions = importedIntroductionReactions("post-1", { "🎉": { count: 5, users: null }, "❤️": ["123"] });
    expect(reactions["🎉"]).toHaveLength(5);
    expect(reactions["❤️"]).toEqual(["discord-123"]);
    expect(importedIntroductionReactions("post-2", null)["🎉"]).toHaveLength(1);
  });
});
