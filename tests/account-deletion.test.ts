import { describe, expect, it } from "vitest";
import {
  accountDeletionDeadline,
  handleAuthRequest,
  hashPassword,
} from "../sites/auth";
import type {
  D1Database,
  D1PreparedStatement,
  SitesEnv,
} from "../sites/platform-types";

function deletionDatabase(passwordHash: string) {
  let pending: Record<string, unknown> | null = null;
  const writes: string[] = [];

  const prepare = (sql: string): D1PreparedStatement => {
    let values: unknown[] = [];
    const statement: D1PreparedStatement = {
      bind: (...next) => {
        values = next;
        return statement;
      },
      first: async <T>() => {
        if (sql.includes("FROM member_sessions ms"))
          return {
            id: 21,
            email: "member@example.com",
            password_hash: passwordHash,
            display_name: "一般会員",
            role: "user",
            access_role: "member",
            branches_json: '["kanto"]',
            account_status: "active",
            last_signed_in_at: null,
            public_member_id: "IRO0021",
            member_term: "2期生",
            member_rank: "gold",
            discord_roles_json: "[]",
            achievement_badges_json: "[]",
            profile_json: "{}",
            xp: 0,
            participation_count: 0,
            organizer_count: 0,
            subscription_started_at: "2024-08-01",
            billing_email: "member@example.com",
            square_status: "ACTIVE",
            access_status: "active",
            paid_until_date: null,
            grace_until_date: null,
          } as T;
        if (sql.includes("FROM account_deletion_requests")) return pending as T;
        if (sql.includes("FROM auth_rate_limits")) return null;
        return null;
      },
      run: async () => {
        writes.push(sql);
        return { success: true };
      },
      all: async () => ({ success: true, results: [] }),
    };
    Object.assign(statement, { __sql: sql, __values: () => values });
    return statement;
  };

  const db: D1Database = {
    prepare,
    batch: async (statements) => {
      for (const statement of statements as Array<
        D1PreparedStatement & { __sql: string; __values: () => unknown[] }
      >) {
        writes.push(statement.__sql);
        const values = statement.__values();
        if (statement.__sql.includes("INSERT INTO account_deletion_requests")) {
          pending = {
            id: values[0],
            status: "pending",
            source: values[2],
            requested_at: values[3],
            scheduled_for: values[4],
          };
        }
        if (statement.__sql.includes("UPDATE account_deletion_requests"))
          pending = null;
      }
      return statements.map(() => ({ success: true }));
    },
  };

  return { db, writes, pending: () => pending };
}

function request(method: string, body?: unknown) {
  return new Request("https://app.example/api/auth/account-deletion", {
    method,
    headers: {
      authorization: "Bearer valid-session",
      origin: "https://app.example",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("account deletion requests", () => {
  it("uses a 30-day processing deadline", () => {
    expect(
      accountDeletionDeadline(new Date("2026-08-24T00:00:00Z")).toISOString(),
    ).toBe("2026-09-23T00:00:00.000Z");
  });

  it("requires password re-authentication and both acknowledgements", async () => {
    const secret = "server-side-secret";
    const store = deletionDatabase(
      await hashPassword("correct-password", undefined, secret),
    );
    const env = { DB: store.db, AUTH_SECRET: secret } as SitesEnv;

    const missingConfirmation = await handleAuthRequest(
      request("POST", { password: "correct-password" }),
      env,
    );
    expect(missingConfirmation?.status).toBe(400);

    const wrongPassword = await handleAuthRequest(
      request("POST", {
        password: "wrong-password",
        understandSubscriptionSeparate: true,
        understandDataHandling: true,
      }),
      env,
    );
    expect(wrongPassword?.status).toBe(401);
    expect(store.pending()).toBeNull();
  });

  it("creates, returns and cancels one pending request with audit logs", async () => {
    const secret = "server-side-secret";
    const store = deletionDatabase(
      await hashPassword("correct-password", undefined, secret),
    );
    const env = { DB: store.db, AUTH_SECRET: secret } as SitesEnv;

    const created = await handleAuthRequest(
      request("POST", {
        password: "correct-password",
        understandSubscriptionSeparate: true,
        understandDataHandling: true,
        source: "web",
      }),
      env,
    );
    expect(created?.status).toBe(202);
    expect((await created?.json())?.request).toMatchObject({
      status: "pending",
      source: "web",
    });
    expect(store.pending()).not.toBeNull();

    const status = await handleAuthRequest(request("GET"), env);
    expect((await status?.json())?.request).toMatchObject({
      status: "pending",
    });

    const cancelled = await handleAuthRequest(request("DELETE"), env);
    expect(cancelled?.status).toBe(200);
    expect(store.pending()).toBeNull();
    expect(
      store.writes.some((sql) =>
        sql.includes("member.account_deletion_requested"),
      ),
    ).toBe(true);
    expect(
      store.writes.some((sql) =>
        sql.includes("member.account_deletion_cancelled"),
      ),
    ).toBe(true);
  });
});
