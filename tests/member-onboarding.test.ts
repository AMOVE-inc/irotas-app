import { describe, expect, it } from "vitest";
import { onboardingLoginStatus } from "../sites/member-onboarding";
import { buildPendingOnboardingCsv } from "../lib/onboarding-csv";
import type { MemberOnboardingRecord } from "../lib/_core/api";

const row = {
  member_id: 1,
  account_status: "active",
  password_set_at: null,
  last_signed_in_at: null,
  code_issued_at: null,
};

describe("member onboarding status", () => {
  it("keeps subscriptions without an account visible as requiring attention", () => {
    expect(onboardingLoginStatus({ ...row, member_id: null })).toBe("needs_attention");
    expect(onboardingLoginStatus({ ...row, account_status: "suspended" })).toBe("needs_attention");
  });
  it("only marks an account complete after a recorded login", () => {
    expect(onboardingLoginStatus(row)).toBe("not_started");
    expect(onboardingLoginStatus({ ...row, code_issued_at: "2026-09-12T00:00:00Z" })).toBe("code_requested");
    expect(onboardingLoginStatus({ ...row, password_set_at: "2026-09-12T00:00:00Z" })).toBe("password_set");
    expect(onboardingLoginStatus({ ...row, last_signed_in_at: "2026-09-12T00:00:00Z" })).toBe("logged_in");
  });
});

describe("pending onboarding CSV", () => {
  const record: MemberOnboardingRecord = {
    subscriptionId: 1,
    billingEmail: "member@example.com",
    subscriptionStatus: "active",
    squareStatus: "ACTIVE",
    paidUntilDate: null,
    graceUntilDate: null,
    memberId: "IRO-1",
    displayName: '=危険な名前',
    accountStatus: "active",
    isTestAccount: false,
    linkIssue: false,
    loginStatus: "not_started",
    passwordSetAt: null,
    lastSignedInAt: null,
    codeIssuedAt: null,
    followUp: {
      outreachStatus: "not_sent",
      sentAt: null,
      lastContactAt: null,
      nextFollowUpAt: null,
      ownerName: "",
      issueNote: '確認,"要連絡"',
    },
  };

  it("exports only incomplete members and escapes spreadsheet formulas and quotes", () => {
    const result = buildPendingOnboardingCsv([record, { ...record, billingEmail: "done@example.com", loginStatus: "logged_in" }]);
    expect(result.count).toBe(1);
    expect(result.csv).toContain('"member@example.com"');
    expect(result.csv).not.toContain("done@example.com");
    expect(result.csv).toContain('"\'=危険な名前"');
    expect(result.csv).toContain('"確認,""要連絡"""');
  });
});
