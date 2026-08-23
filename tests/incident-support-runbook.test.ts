import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runbook = readFileSync("docs/operations/incident-support-runbook.md", "utf8");

describe("incident and support runbook", () => {
  it("defines owners, severity, intake, recovery, and closure", () => {
    expect(runbook).toContain("運用責任者: Non");
    expect(runbook).toContain("技術調査・修正: Codex");
    expect(runbook).toContain("P0 緊急");
    expect(runbook).toContain("P1 重大");
    expect(runbook).toContain("受付から解決まで");
    expect(runbook).toContain("復旧確認");
    expect(runbook).toContain("問い合わせ対応の終了条件");
  });

  it("forbids sensitive values in operational records", () => {
    expect(runbook).toContain("メールアドレス");
    expect(runbook).toContain("Square ID");
    expect(runbook).toContain("カード情報");
    expect(runbook).toContain("秘密値");
    expect(runbook).toContain("会員ID、障害は確認IDで参照");
  });

  it("covers production verification and daily monitoring", () => {
    expect(runbook).toContain("未ログインの会員・管理APIが401");
    expect(runbook).toContain("本番ヘルス");
    expect(runbook).toContain("Square同期・Webhook");
    expect(runbook).toContain("公開後の日次確認");
    expect(runbook).toContain("障害後レビュー");
  });
});
