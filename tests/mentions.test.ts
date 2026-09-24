import { describe, expect, it } from "vitest";
import { CLUBS, MEMBERS } from "../constants/mock-data";
import { getMentionGroups, getMentionQuery, getMentionedMemberIds, insertMention, mentionsViewer, selectedEventMentionLabels } from "../lib/mentions";

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
    expect(getMentionQuery("確認お願いします @山田 太郎")).toBe("山田 太郎");
    expect(insertMention("確認お願いします @関東", "関東支部")).toBe("確認お願いします @関東支部 ");
    expect(insertMention("確認お願いします @杏", "杏奈", "IRO0021")).toBe("確認お願いします @杏奈 ");
    expect(getMentionQuery("＠関東支部\n続き", 2)).toBe("関");
    expect(insertMention("前半 ＠関 後半", "関東支部", undefined, 5)).toBe("前半 @関東支部  後半");
    expect(selectedEventMentionLabels("@関東支部 @杏奈（IRO0021）", groups.filter((group) => group.category === "branch"))).toEqual(["@関東支部", "@杏奈"]);
  });

  it("distinguishes exact personal, branch, and joined-club mentions", () => {
    const labels = ["さくら", "関東支部", "旅行部", "everyone"];
    expect(mentionsViewer("@さくら @関東支部 @旅行部", labels)).toBe(true);
    expect(mentionsViewer("@旅行部員", labels)).toBe(false);
    expect(mentionsViewer("@関西支部", labels)).toBe(false);
    expect(mentionsViewer("@スポーツ部", labels)).toBe(false);
    expect(mentionsViewer("@everyone", labels)).toBe(true);
  });

  it("supports names with spaces and punctuation after mentions", () => {
    expect(mentionsViewer("確認をお願いします、@Non 【IRO+代表】。", ["Non 【IRO+代表】"])).toBe(true);
    expect(mentionsViewer("@Non 【IRO+代表】さん", ["Non 【IRO+代表】"])).toBe(false);
  });
});
