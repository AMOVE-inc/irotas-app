import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guide = readFileSync("docs/operations/web-pwa-rollout.md", "utf8");

describe("Web/PWA rollout guide", () => {
  it("groups automated and human rollout checks", () => {
    expect(guide).toContain("公開前の自動確認（Codex）");
    expect(guide).toContain("運営メンバー1名と一般メンバー1名");
    expect(guide).toContain("公開後24時間");
    expect(guide).toContain("公式LINEと相談・通報窓口");
  });

  it("defines privacy and access-control stop conditions", () => {
    expect(guide).toContain("他人の非公開データ");
    expect(guide).toContain("決済情報、メールアドレス、認証情報");
    expect(guide).toContain("Square停止・解約済み会員");
    expect(guide).toContain("誤ったアカウントのプロフィール");
  });
});
