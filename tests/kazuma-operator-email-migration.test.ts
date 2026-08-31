import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  `${process.cwd()}/drizzle/0025_kazuma_operator_email.sql`,
  "utf8",
);

describe("Kazuma operator email migration", () => {
  it("updates only the known Discord operator account", () => {
    expect(migration).toContain("discord_user_id = '1228677950401151139'");
    expect(migration).toContain("email = 'eguchi.work0419@gmail.com'");
    expect(migration).toContain("email = 'kazuma@e-eternal.com'");
  });

  it("keeps subscription references aligned and invalidates old verification codes", () => {
    expect(migration).toContain("UPDATE member_subscriptions");
    expect(migration).toContain("billing_email = 'kazuma@e-eternal.com'");
    expect(migration).toContain("DELETE FROM email_verification_codes");
  });
});
