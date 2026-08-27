import { describe, expect, it } from "vitest";
import { handleBackupReadinessRequest, REQUIRED_BACKUP_TABLES } from "../sites/backup-readiness";
import type { D1Database, D1PreparedStatement, D1Result, SitesEnv } from "../sites/platform-types";

function database(role: "member" | "admin") {
  const preparedSql: string[] = [];
  const prepare = (sql: string): D1PreparedStatement => {
    preparedSql.push(sql);
    const statement: D1PreparedStatement = {
      bind: () => statement,
      first: async <T>() => {
        if (sql.includes("FROM member_sessions ms")) return {
          id: 1, email: "admin@example.com", password_hash: "hash", display_name: "管理者",
          role: role === "admin" ? "admin" : "user", access_role: role,
          branches_json: "[]", account_status: "active", public_member_id: "IRO0001",
          member_term: null, member_rank: "regular", discord_roles_json: "[]",
          achievement_badges_json: "[]", profile_json: "{}", xp: 0,
          participation_count: 0, organizer_count: 0, billing_email: "admin@example.com",
          square_status: "ACTIVE", access_status: "active",
        } as T;
        if (sql.includes("FROM system_metadata")) return { value: "22" } as T;
        return null;
      },
      all: async <T>() => ({ success: true, results: [] as T[] }),
      run: async () => ({ success: true }),
    };
    Object.assign(statement, { __sql: sql });
    return statement;
  };
  const db: D1Database = {
    prepare,
    batch: async <T = unknown>(statements: D1PreparedStatement[]) => statements.map((statement, index) => ({
      success: true,
      results: [{ count: index + 1 }],
      meta: { sql: (statement as D1PreparedStatement & { __sql: string }).__sql },
    })) as unknown as D1Result<T>[],
  };
  return { db, preparedSql };
}

function environment(role: "member" | "admin") {
  const store = database(role);
  const cursors: (string | undefined)[] = [];
  const env = {
    DB: store.db,
    AUTH_SECRET: "secret",
    UPLOADS: {
      list: async (options?: { cursor?: string }) => {
        cursors.push(options?.cursor);
        if (!options?.cursor) return {
          objects: [
            { key: "private/member-photo.jpg", size: 100 },
            { key: "private/event-photo.jpg", size: 200 },
          ],
          truncated: true,
          cursor: "next-page",
        };
        return {
          objects: [{ key: "private/comment-photo.jpg", size: 300 }],
          truncated: false,
        };
      },
    },
  } as SitesEnv;
  return { ...store, env, cursors };
}

function request(method = "GET") {
  return new Request("https://app.example/api/admin/backup-readiness", {
    method,
    headers: { authorization: "Bearer admin-session" },
  });
}

describe("backup readiness", () => {
  it("allows administrators only", async () => {
    const store = environment("member");
    const response = await handleBackupReadinessRequest(request(), store.env);
    expect(response?.status).toBe(403);
    expect(store.preparedSql.some((sql) => sql.includes("COUNT(*)"))).toBe(false);
  });

  it("rejects mutation methods", async () => {
    const store = environment("admin");
    const response = await handleBackupReadinessRequest(request("POST"), store.env);
    expect(response?.status).toBe(405);
  });

  it("returns a privacy-safe manifest and aggregates all R2 pages", async () => {
    const store = environment("admin");
    const response = await handleBackupReadinessRequest(request(), store.env);
    expect(response?.status).toBe(200);
    const payload = await response!.json() as {
      ready: boolean;
      manifest: {
        schemaVersion: number;
        d1: { tableCounts: Record<string, number> };
        r2: { objectCount: number; totalBytes: number };
      };
    };
    expect(payload.ready).toBe(true);
    expect(payload.manifest.schemaVersion).toBe(22);
    expect(Object.keys(payload.manifest.d1.tableCounts)).toEqual(REQUIRED_BACKUP_TABLES);
    expect(payload.manifest.d1.tableCounts.members).toBe(1);
    expect(payload.manifest.r2).toEqual({ objectCount: 3, totalBytes: 600 });
    expect(store.cursors).toEqual([undefined, "next-page"]);

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("admin@example.com");
    expect(serialized).not.toContain("private/");
    expect(serialized).not.toContain("photo.jpg");
    expect(store.preparedSql.every((sql) => !/\b(?:INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(true);
  });
});
