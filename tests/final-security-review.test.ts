import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const review = readFileSync("docs/operations/final-security-review.md", "utf8");

describe("final security review", () => {
  it("covers privacy, payment, roles, migration and stop conditions", () => {
    for (const heading of [
      "個人情報",
      "決済",
      "権限",
      "会員突合",
      "管理者が本番で確認する項目",
      "移行直前の停止条件",
    ]) {
      expect(review).toContain(heading);
    }
  });

  it("forbids recording sensitive values and keeps the current verdict provisional", () => {
    expect(review).toContain("秘密値・メールアドレス・Discord ID・Square識別子そのものは");
    expect(review).toContain("暫定NoGo");
    expect(review).toContain("WBS No.77");
  });
});
