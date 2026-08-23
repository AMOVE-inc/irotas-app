import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runbook = readFileSync("docs/operations/secret-rotation-runbook.md", "utf8");

describe("secret rotation runbook", () => {
  it("covers every production server secret without embedding values", () => {
    for (const key of [
      "AUTH_SECRET",
      "SQUARE_ACCESS_TOKEN",
      "SQUARE_WEBHOOK_SIGNATURE_KEY",
      "RESEND_API_KEY",
      "EMAIL_DELIVERY_WEBHOOK_TOKEN",
      "GOOGLE_MAPS_API_KEY",
      "GOURMET_MAP_FEED_URL",
    ]) expect(runbook).toContain(`\`${key}\``);
    expect(runbook).not.toMatch(/(?:sk_live_|EAAA[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,})/);
  });

  it("documents validation, emergency rotation and rollback", () => {
    expect(runbook).toContain("## 通常ローテーション");
    expect(runbook).toContain("## 緊急ローテーション");
    expect(runbook).toContain("## ロールバック");
    expect(runbook).toContain("/api/platform/health");
  });
});
