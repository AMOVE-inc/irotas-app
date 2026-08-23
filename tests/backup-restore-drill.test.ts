import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_D1_TABLES, verifyBackupManifest } from "../scripts/verify-backup-manifest.mjs";

const example = JSON.parse(readFileSync("docs/operations/backup-manifest.example.json", "utf8"));
const drill = readFileSync("docs/operations/backup-restore-drill.md", "utf8");
const freeze = readFileSync("docs/operations/final-migration-freeze.md", "utf8");

describe("backup restore drill", () => {
  it("accepts the redacted example manifest", () => {
    expect(REQUIRED_D1_TABLES).toHaveLength(13);
    expect(verifyBackupManifest(example)).toEqual({ valid: true, errors: [] });
  });

  it("rejects missing tables, old schemas and sensitive fields", () => {
    const unsafe = structuredClone(example);
    unsafe.schemaVersion = 20;
    delete unsafe.d1.tableCounts.chat_messages;
    unsafe.billingEmail = "member@example.com";
    const result = verifyBackupManifest(unsafe);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/schemaVersion|chat_messages|sensitive fields/);
  });

  it("keeps restore isolated and defines freeze and rollback controls", () => {
    expect(drill).toContain("本番DB・本番画像を直接上書きせず");
    expect(drill).toContain("一時環境を削除");
    expect(freeze).toContain("更新凍結中");
    expect(freeze).toContain("ロールバック条件");
    expect(freeze).toContain("Squareの決済自体は停止せず");
  });
});
