import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0007_stable_member_numbers.sql"),
  "utf8",
);
const memberImport = readFileSync(
  resolve(process.cwd(), "sites/member-import.ts"),
  "utf8",
);
const auth = readFileSync(
  resolve(process.cwd(), "sites/auth.ts"),
  "utf8",
);

describe("stable member numbering", () => {
  it("numbers current members first using Square history", () => {
    expect(migration).toContain("operator_square_history");
    expect(migration).toContain("MIN(subscription_started_at)");
    expect(migration).toContain("access_status IN ('active', 'grace')");
    expect(migration).toContain("ORDER BY member_priority, basis_date, email_sort, id");
  });

  it("keeps a durable allocation ledger and never reuses an allocated number", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS member_id_assignments");
    expect(migration).toContain("assigned_number INTEGER NOT NULL UNIQUE");
    expect(migration).toContain("CREATE TRIGGER IF NOT EXISTS trg_members_assign_public_member_id");
    expect(migration).toContain("SET next_number = next_number + 1");
  });

  it("does not overwrite an existing member ID during later CSV imports", () => {
    expect(memberImport).toContain("VALUES (?, ?, ?, NULL, 'user', 'member'");
    expect(memberImport).not.toContain("public_member_id = excluded.public_member_id");
  });

  it("creates a member account automatically after Square eligibility is confirmed", () => {
    expect(auth).toContain("member.auto_created_from_square");
    expect(auth).toContain("if (!member)");
  });
});
