import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMMUNITY_TERMS_URL,
  EVENT_TERMS_URL,
  OFFICIAL_LINE_URL,
  PRIVACY_POLICY_URL,
  REPORT_FORM_URL,
} from "../constants/external-links";

const faq = readFileSync("app/faq.tsx", "utf8");
const manual = readFileSync("app/manual.tsx", "utf8");
const rules = readFileSync("app/community-rules.tsx", "utf8");
const profile = readFileSync("app/(tabs)/profile.tsx", "utf8");

describe("FAQ, rules and manual", () => {
  it("documents the current branch, XP and points behavior", () => {
    expect(faq).toContain("所属支部の変更");
    expect(faq).toContain("両方の支部を選択");
    expect(faq).toContain("XPとIRO+ポイントの違い");
    expect(faq).toContain("XPをIRO+ポイントとして使うことはできません");
    expect(faq).not.toContain("運営が確認して変更");
  });

  it("matches the current first login and club application flow", () => {
    expect(manual).toContain("Square決済時のメールアドレス");
    expect(manual).toContain("6桁の認証コード");
    expect(manual).toContain("入部申請");
    expect(manual).toContain("部員専用スレ");
    expect(manual).toContain("iPhoneはSafari");
    expect(manual).toContain("AndroidはChrome");
    expect(manual).toContain("ホーム画面に追加");
  });

  it("keeps support and policy routes visible from My Page", () => {
    for (const route of ["/faq", "/manual", "/contact", "/community-rules"])
      expect(profile).toContain(`router.push(\"${route}`);
  });

  it("uses the official policy and report destinations", () => {
    expect(COMMUNITY_TERMS_URL).toBe("https://irotas-community.com/terms");
    expect(EVENT_TERMS_URL).toBe("https://irotas-community.com/event-terms");
    expect(PRIVACY_POLICY_URL).toBe("https://irotas-community.com/privacy");
    expect(OFFICIAL_LINE_URL).toBe("https://lin.ee/Rr00sCb");
    expect(REPORT_FORM_URL).toContain("docs.google.com/forms/");
    expect(rules).toContain("REPORT_FORM_URL");
    expect(rules).not.toContain("discord.com/channels/");
  });
});
