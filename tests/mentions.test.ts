import { describe, expect, it } from "vitest";
import { CLUBS, MEMBERS } from "../constants/mock-data";
import { getMentionGroups, getMentionQuery, getMentionedMemberIds, insertMention } from "../lib/mentions";

const groups = getMentionGroups(MEMBERS, CLUBS);

describe("group mentions", () => {
  it("provides all requested group mention types", () => {
    const labels = groups.map((group) => group.label);
    expect(labels).toContain("everyone");
    expect(labels).toContain("関東支部");
    expect(labels).toContain("関西支部");
    expect(labels).toContain("運営");
    expect(labels).toContain("第1期メンバー");
    expect(labels).toContain("ワイン部");
    expect(labels).toContain("シルバー会員");
  });

  it("combines recipients from multiple group and personal mentions", () => {
    const ids = getMentionedMemberIds("@関西支部 @運営 @さくら 確認をお願いします", MEMBERS, groups);
    expect(ids).toContain("u1");
    expect(ids).toContain("u2");
    expect(ids).toContain("u3");
    expect(ids).toContain("u5");
  });

  it("limits group recipients to chat participants when a scope is supplied", () => {
    expect(getMentionedMemberIds("@everyone", MEMBERS, groups, ["u1", "u2"])).toEqual(["u1", "u2"]);
  });

  it("detects a mention query and inserts the selected label", () => {
    expect(getMentionQuery("確認お願いします @関東")).toBe("関東");
    expect(insertMention("確認お願いします @関東", "関東支部")).toBe("確認お願いします @関東支部 ");
  });
});
