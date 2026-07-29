import { describe, expect, it } from "vitest";
import { classifyRoleName, normalizedRank, parseDiscordRoles } from "../lib/role-migration";

describe("role migration", () => {
  it("parses Discord role IDs while retaining name-only exports", () => {
    expect(parseDiscordRoles("111:関東支部|222:ワイン部;第1期メンバー")).toEqual([
      { externalId: "111", name: "関東支部" },
      { externalId: "222", name: "ワイン部" },
      { externalId: "name:第1期メンバー", name: "第1期メンバー" },
    ]);
  });

  it.each([
    ["IRO+運営", "operator"],
    ["関西支部", "branch"],
    ["第12期メンバー", "generation"],
    ["ワイン部", "club"],
    ["ゴールド会員", "rank"],
    ["お知らせ通知", "other"],
  ] as const)("classifies %s", (name, category) => {
    expect(classifyRoleName(name)).toBe(category);
  });

  it("normalizes the member rank", () => {
    expect(normalizedRank("プラチナ会員")).toBe("platinum");
  });
});
