import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packet = readFileSync(resolve(process.cwd(), "docs/operations/store-submission-packet.md"), "utf8");
const config = readFileSync(resolve(process.cwd(), "app.config.ts"), "utf8");
const reviewAccount = readFileSync(resolve(process.cwd(), "sites/review-account.ts"), "utf8");

describe("store submission packet", () => {
  it("documents privacy, deletion and reviewer access URLs", () => {
    expect(packet).toContain("Apple App Privacy");
    expect(packet).toContain("Google Play Data Safety");
    expect(packet).toContain("/account-deletion");
    expect(packet).toContain("https://irotas-community.com/privacy-policy");
  });

  it("matches declared device permission behavior", () => {
    expect(config).toContain("photosPermission");
    expect(config).toContain("cameraPermission");
    expect(config).toContain('"POST_NOTIFICATIONS"');
    expect(config).toContain('microphonePermission: false');
    expect(packet).toContain("端末の位置情報 | 使用しない");
  });

  it("keeps the review account isolated from production Square membership", () => {
    expect(reviewAccount).toContain('"isTestAccount":true');
    expect(reviewAccount).toContain('"isReviewAccount":true');
    expect(reviewAccount).toContain("REVIEW_ACCOUNT");
    expect(reviewAccount).toContain("square_customer_id = NULL");
    expect(reviewAccount).toContain("access_role = 'member'");
  });
});
