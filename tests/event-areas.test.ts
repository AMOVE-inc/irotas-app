import { describe, expect, it } from "vitest";
import { EVENT_AREA_GROUPS, PREFECTURE_TO_REGION } from "../constants/event-areas";

describe("event area choices", () => {
  it("groups prefectures into Kanto, Kansai, and other", () => {
    expect(EVENT_AREA_GROUPS.map((group) => group.region)).toEqual(["関東", "関西", "その他"]);
    expect(PREFECTURE_TO_REGION["東京都"]).toBe("region:kanto");
    expect(PREFECTURE_TO_REGION["大阪府"]).toBe("region:kansai");
    expect(PREFECTURE_TO_REGION["愛知県"]).toBe("region:other");
  });
});
