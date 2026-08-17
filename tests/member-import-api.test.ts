import { describe, expect, it } from "vitest";
import {
  memberImportConfiguration,
  validateMemberImportRequest,
} from "../sites/member-import";

function row(overrides: Record<string, unknown> = {}) {
  return {
    member_id: "IRO0001",
    subscription_created_at: "2024-01-01",
    discord_user_id: "123456789012345678",
    billing_email: "Member@Example.com",
    display_name: "テスト会員",
    discord_roles: "関東支部|運営メンバー|ゴールド",
    square_customer_id: "CUSTOMER-1",
    square_subscription_id: "SUBSCRIPTION-1",
    square_plan_id: "PLAN-1",
    subscription_status: "有効",
    billing_status: "支払済み",
    access_status: "active",
    grace_until_date: "",
    paid_until_date: "2026-09-01",
    migration_action: "import",
    ...overrides,
  };
}

describe("secure member import validation", () => {
  it("requires email authentication and Square before production import", () => {
    expect(memberImportConfiguration({} as never)).toEqual({
      authentication: false,
      square: false,
      ready: false,
    });
    expect(
      memberImportConfiguration({
        AUTH_SECRET: "secret",
        EMAIL_DELIVERY_WEBHOOK_URL: "https://email.example.test",
        SQUARE_ACCESS_TOKEN: "token",
        SQUARE_WEBHOOK_SIGNATURE_KEY: "signature",
        SQUARE_WEBHOOK_NOTIFICATION_URL: "https://app.example.test/webhook",
        SQUARE_ALLOWED_PLAN_VARIATION_IDS: "plan-1",
      } as never),
    ).toEqual({ authentication: true, square: true, ready: true });
  });

  it("normalizes a reviewed import row without carrying privileged Discord roles", () => {
    const result = validateMemberImportRequest({
      confirmation: "IMPORT_1",
      sourceFilename: "reviewed-members.csv",
      rows: [row()],
    });
    expect(result.rows[0]).toMatchObject({
      email: "member@example.com",
      accessStatus: "active",
      squareStatus: "ACTIVE",
      branchesJson: '["関東"]',
    });
    expect(result.rows[0]).not.toHaveProperty("role");
    expect(result.rows[0]).not.toHaveProperty("accessRole");
  });

  it("requires an exact confirmation phrase", () => {
    expect(() =>
      validateMemberImportRequest({ confirmation: "IMPORT", rows: [row()] }),
    ).toThrow("confirmation_required");
  });

  it("rejects review rows and duplicate identifiers", () => {
    expect(() =>
      validateMemberImportRequest({
        confirmation: "IMPORT_1",
        rows: [row({ migration_action: "review" })],
      }),
    ).toThrow("unsafe_action");
    expect(() =>
      validateMemberImportRequest({
        confirmation: "IMPORT_2",
        rows: [row(), row({ member_id: "IRO0002" })],
      }),
    ).toThrow("duplicate_email");
  });

  it("limits each reviewed batch to 25 members", () => {
    const rows = Array.from({ length: 26 }, (_, index) =>
      row({
        member_id: `IRO${String(index + 1).padStart(4, "0")}`,
        billing_email: `member${index}@example.com`,
        discord_user_id: String(123456789012345670n + BigInt(index)),
        square_customer_id: `CUSTOMER-${index}`,
        square_subscription_id: `SUBSCRIPTION-${index}`,
      }),
    );
    expect(() =>
      validateMemberImportRequest({ confirmation: "IMPORT_26", rows }),
    ).toThrow("too_many_rows");
  });
});
