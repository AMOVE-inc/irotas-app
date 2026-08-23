import { describe, expect, it } from "vitest";
import { recordApplicationError, safeErrorDetails, safeRequestPath } from "../sites/system-monitoring";
import type { D1Database, D1PreparedStatement } from "../sites/platform-types";

function captureDatabase(values: unknown[]) {
  const db: D1Database = {
    prepare(sql: string) {
      const statement: D1PreparedStatement = {
        bind(...input: unknown[]) {
          values.push(sql, ...input);
          return statement;
        },
        async first<T>() { return null as T | null; },
        async run() { return { success: true }; },
        async all() { return { success: true, results: [] }; },
      };
      return statement;
    },
    async batch() { return []; },
  };
  return db;
}

describe("system monitoring", () => {
  it("stores only a sanitized path and bounded error details", async () => {
    const values: unknown[] = [];
    const request = new Request("https://app.example/api/private?token=secret", { method: "POST" });
    await recordApplicationError(captureDatabase(values), request, "req-123", new Error("failed\nAuthorization: secret"));
    const serialized = JSON.stringify(values);
    expect(serialized).toContain("/api/private");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).not.toContain("Authorization: secret\n");
    expect(serialized).toContain("failed Authorization: secret");
  });

  it("never exposes query strings and bounds untrusted errors", () => {
    expect(safeRequestPath(new Request("https://app.example/path?a=1"))).toBe("/path");
    const details = safeErrorDetails(new Error("x".repeat(800)));
    expect(details.message).toHaveLength(500);
  });

  it("does not fail the application when monitoring storage is unavailable", async () => {
    const db = captureDatabase([]);
    db.prepare = () => { throw new Error("database unavailable"); };
    await expect(recordApplicationError(db, new Request("https://app.example/"), "req", new Error("boom"))).resolves.toBeUndefined();
  });
});
