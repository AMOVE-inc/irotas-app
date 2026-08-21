import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0010_general_member_test_account.sql"),
  "utf8",
);
const memberDirectory = readFileSync(
  resolve(process.cwd(), "sites/member-directory.ts"),
  "utf8",
);
const squareSync = readFileSync(
  resolve(process.cwd(), "sites/square-sync.ts"),
  "utf8",
);

describe("general member QA account", () => {
  it("creates the requested account with general-member permissions only", () => {
    expect(migration).toContain("kanon1998915@icloud.com");
    expect(migration).toContain("'user', 'member'");
    expect(migration).toContain("'IRO-TEST-001'");
    expect(migration).toContain("'{\"isTestAccount\":true}'");
  });

  it("does not create or synchronize a production Square identity", () => {
    expect(migration).toContain("'TEST_ACCOUNT'");
    expect(migration).toContain("square_customer_id = NULL");
    expect(migration).toContain("square_subscription_id = NULL");
  });

  it("excludes the QA account from member search and membership totals", () => {
    expect(memberDirectory).toContain("$.isTestAccount");
    expect(squareSync).toContain("$.isTestAccount");
    expect(squareSync).toContain("billing_status, '') <> 'TEST_ACCOUNT'");
  });
});
