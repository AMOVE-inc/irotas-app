import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(`${process.cwd()}/drizzle/0026_shared_campaigns_and_safe_event_import.sql`, "utf8");

describe("shared campaign and safe event import migration", () => {
  it("moves campaigns to D1 and keeps the original defaults", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS campaigns");
    expect(migration).toContain("幹事応援キャンペーン");
    expect(migration).toContain("友人招待キャンペーン");
  });

  it("keys imports by Discord thread and records protected edits and conflicts", () => {
    expect(migration).toContain("source_thread_id TEXT NOT NULL UNIQUE");
    expect(migration).toContain("event_import_field_edits");
    expect(migration).toContain("event_import_conflicts");
    expect(migration).toContain("backup_snapshots");
  });
});
