import { describe, expect, it } from "vitest";
import { handleAccountDeletionAdminRequest } from "../sites/account-deletion-admin";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

function database(accessRole: "member" | "admin") {
  const writes: string[] = [];
  const row = { id: "delete-1", member_id: 45, status: "pending", source: "app", requested_at: "2026-08-24T00:00:00.000Z", scheduled_for: "2026-09-23T00:00:00.000Z", completed_at: null, display_name: "削除希望会員", public_member_id: "IRO0045" };
  const prepare = (sql: string): D1PreparedStatement => {
    let values: unknown[] = [];
    const statement: D1PreparedStatement = {
      bind: (...next) => { values = next; return statement; },
      first: async <T>() => {
        if (sql.includes("FROM member_sessions ms")) return { id: 1, email: "admin@example.com", password_hash: "hash", display_name: "管理者", role: accessRole === "admin" ? "admin" : "user", access_role: accessRole, branches_json: '["kanto"]', account_status: "active", public_member_id: "IRO0001", member_term: null, member_rank: "regular", discord_roles_json: "[]", achievement_badges_json: "[]", profile_json: "{}", xp: 0, participation_count: 0, organizer_count: 0, billing_email: "admin@example.com", square_status: "ACTIVE", access_status: "active" } as T;
        if (sql.includes("FROM account_deletion_requests r")) return row as T;
        return null;
      },
      all: async <T>() => ({ success: true, results: [row] as T[] }),
      run: async () => ({ success: true }),
    };
    Object.assign(statement, { __sql: sql, __values: () => values });
    return statement;
  };
  const db: D1Database = { prepare, batch: async (statements) => { for (const statement of statements as (D1PreparedStatement & { __sql: string })[]) writes.push(statement.__sql); return statements.map(() => ({ success: true })); } };
  return { db, writes };
}

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`https://app.example${path}`, { method, headers: { authorization: "Bearer admin-session", origin: "https://app.example", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
}

describe("admin account deletion processing", () => {
  it("rejects general members", async () => {
    const store = database("member");
    const response = await handleAccountDeletionAdminRequest(request("/api/admin/account-deletions"), { DB: store.db, AUTH_SECRET: "secret" } as SitesEnv);
    expect(response?.status).toBe(403);
  });

  it("lists requests without exposing email or Square identifiers", async () => {
    const store = database("admin");
    const response = await handleAccountDeletionAdminRequest(request("/api/admin/account-deletions"), { DB: store.db, AUTH_SECRET: "secret" } as SitesEnv);
    const body = await response?.json();
    expect(body.requests[0]).toMatchObject({ displayName: "削除希望会員", publicMemberId: "IRO0045", status: "pending" });
    expect(JSON.stringify(body)).not.toContain("email");
    expect(JSON.stringify(body)).not.toContain("square");
  });

  it("requires confirmation and anonymizes personal fields", async () => {
    const store = database("admin");
    const env = { DB: store.db, AUTH_SECRET: "secret" } as SitesEnv;
    const missing = await handleAccountDeletionAdminRequest(request("/api/admin/account-deletions/delete-1/complete", "POST", {}), env);
    expect(missing?.status).toBe(400);
    const completed = await handleAccountDeletionAdminRequest(request("/api/admin/account-deletions/delete-1/complete", "POST", { confirm: "ANONYMIZE" }), env);
    expect(completed?.status).toBe(200);
    expect(store.writes.some((sql) => sql.includes("DELETE FROM member_sessions"))).toBe(true);
    expect(store.writes.some((sql) => sql.includes("display_name = '退会済みユーザー'"))).toBe(true);
    expect(store.writes.some((sql) => sql.includes("admin.account_deletion_completed"))).toBe(true);
  });
});
