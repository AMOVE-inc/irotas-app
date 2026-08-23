import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packet = readFileSync("docs/operations/go-nogo-decision-packet.md", "utf8");

describe("Go / NoGo decision packet", () => {
  it("remains NoGo until every final release gate is complete", () => {
    expect(packet).toContain("暫定NoGo");
    for (const gate of ["会員データ最終突合", "バックアップ復元", "実アカウント受入", "更新凍結・最終移行"]) {
      expect(packet).toContain(gate);
    }
  });

  it("groups human acceptance and protects sensitive artifacts", () => {
    expect(packet).toContain("人への確認依頼は権限・端末ごとにまとめて1回");
    expect(packet).toContain("個人情報・バックアップ本体・秘密値は添付しない");
    expect(packet).toContain("NoGo条件");
  });
});
