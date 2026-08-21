import { describe, expect, it } from "vitest";
import { CLUBS } from "../constants/mock-data";
import { getClubIntroductionContent } from "../lib/club-introduction";

describe("club introduction", () => {
  it("uses the migrated board introduction for the application overview", () => {
    const breadClub = CLUBS.find((club) => club.name === "パン部")!;
    const content = getClubIntroductionContent(breadClub);

    expect(content).toContain("パン部のコンセプト");
    expect(content).toContain("小麦に溺れる");
    expect(content).not.toContain("入部申請フォーム");
  });

  it("falls back to the catalog description when an introduction is unavailable", () => {
    expect(getClubIntroductionContent({ name: "テスト部", description: "テスト部の説明" })).toBe("テスト部の説明");
  });
});
