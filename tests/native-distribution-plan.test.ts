import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRIVACY_POLICY_URL } from "../constants/external-links";

const config = readFileSync("app.config.ts", "utf8");
const eas = JSON.parse(readFileSync("eas.json", "utf8"));
const plan = readFileSync(
  "docs/operations/native-distribution-plan.md",
  "utf8",
);
const settings = readFileSync("app/app-settings.tsx", "utf8");
const deletionPage = readFileSync("app/account-deletion.tsx", "utf8");
const layout = readFileSync("app/_layout.tsx", "utf8");

describe("native distribution readiness", () => {
  it("uses a stable production identifier and separated EAS profiles", () => {
    expect(config).toContain('"com.irotas.community"');
    expect(config).toContain('"iroplus"');
    expect(config).not.toContain("space.manus.irotas.app");
    expect(eas.build.preview.distribution).toBe("internal");
    expect(eas.build.production.autoIncrement).toBe(true);
  });

  it("links the published privacy policy from settings", () => {
    expect(PRIVACY_POLICY_URL).toBe("https://irotas-community.com/privacy");
    expect(settings).toContain("Linking.openURL(PRIVACY_POLICY_URL)");
  });

  it("tracks every current store blocker explicitly", () => {
    for (const requirement of [
      "アプリ内からアカウント削除",
      "Webのアカウント削除申請ページ",
      "一般メンバー用の審査アカウント",
      "Android 16 / API level 36",
      "Data Safety",
      "TestFlight",
    ]) {
      expect(plan).toContain(requirement);
    }
  });

  it("provides a public web entry and in-app account deletion request", () => {
    expect(settings).toContain('router.push("/account-deletion"');
    expect(layout).toContain('String(segments[0]) === "account-deletion"');
    expect(deletionPage).toContain("ログインして削除申請へ");
    expect(deletionPage).toContain("Squareの定期決済は別途解約手続き");
    expect(deletionPage).toContain("requestAccountDeletion");
  });
});
