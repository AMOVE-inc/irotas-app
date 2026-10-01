import { describe, expect, it, vi } from "vitest";
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

function deletionDatabase(
  passwordHash: string,
  options: { missingSubscription?: boolean } = {},
) {
  let pending: Record<string, unknown> | null = null;
  let subscriptionDiscovered = false;
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
            square_subscription_id:
              options.missingSubscription && !subscriptionDiscovered
                ? null
                : "subscription-21",
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
        if (sql.includes("INSERT INTO member_subscriptions"))
          subscriptionDiscovered = true;
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
      for (const statement of statements as (D1PreparedStatement & { __sql: string; __values: () => unknown[] })[]) {
        writes.push(statement.__sql);
        const values = statement.__values();
        if (statement.__sql.includes("INSERT INTO account_deletion_requests")) {
          pending = {
            id: values[0],
            status: values[2],
            source: values[3],
            requested_at: values[4],
            scheduled_for: values[5],
            request_type: values[7],
            square_action: values[9],
            square_effective_date: values[10],
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
        understandSquareChange: true,
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
    const env = { DB: store.db, AUTH_SECRET: secret, SQUARE_ACCESS_TOKEN: "square-token" } as SitesEnv;
    const square = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ subscription: { id: "subscription-21", status: "ACTIVE", canceled_date: "2026-09-01" } }));

    const created = await handleAuthRequest(
      request("POST", {
        password: "correct-password",
        requestType: "withdrawal",
        reasons: ["参加する時間が取れない"],
        surveyComment: "再開予定あり",
        satisfaction: 4,
        satisfactionReason: "イベントには満足していたため",
        understandSquareChange: true,
        understandDataHandling: true,
        source: "web",
      }),
      env,
    );
    expect(created?.status).toBe(202);
    expect((await created?.json())?.request).toMatchObject({
      status: "pending",
      source: "web",
      squareAction: "cancel_scheduled",
      squareEffectiveDate: "2026-09-01",
    });
    expect(store.pending()).not.toBeNull();

    const status = await handleAuthRequest(request("GET"), env);
    expect((await status?.json())?.request).toMatchObject({
      status: "pending",
      squareEffectiveDate: "2026-09-01",
    });

    const cancelled = await handleAuthRequest(request("DELETE"), env);
    expect(cancelled?.status).toBe(200);
    expect(store.pending()).toBeNull();
    expect(
      store.writes.some((sql) =>
        sql.includes("member.account_deletion_requested"),
      ),
    ).toBe(true);
    expect(square).toHaveBeenCalledWith(expect.stringContaining("/cancel"), expect.objectContaining({ method: "POST" }));
    square.mockRestore();
    expect(
      store.writes.some((sql) =>
        sql.includes("member.account_deletion_cancelled"),
      ),
    ).toBe(true);
  });

  it("discovers an older member's Square subscription before withdrawal", async () => {
    const secret = "server-side-secret";
    const store = deletionDatabase(
      await hashPassword("correct-password", undefined, secret),
      { missingSubscription: true },
    );
    const env = {
      DB: store.db,
      AUTH_SECRET: secret,
      SQUARE_ACCESS_TOKEN: "square-token",
    } as SitesEnv;
    const square = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/customers/search"))
        return Response.json({
          customers: [
            { id: "customer-21", email_address: "member@example.com" },
          ],
        });
      if (url.endsWith("/subscriptions/search"))
        return Response.json({
          subscriptions: [
            {
              id: "subscription-21",
              customer_id: "customer-21",
              status: "ACTIVE",
              start_date: "2024-08-01",
            },
          ],
        });
      if (url.endsWith("/subscriptions/subscription-21/cancel"))
        return Response.json({
          subscription: {
            id: "subscription-21",
            status: "ACTIVE",
            canceled_date: "2026-10-01",
          },
        });
      return new Response("not found", { status: 404 });
    });

    const created = await handleAuthRequest(
      request("POST", {
        password: "correct-password",
        requestType: "withdrawal",
        reasons: [],
        surveyComment: "",
        understandSquareChange: true,
        understandDataHandling: true,
        source: "web",
      }),
      env,
    );

    expect(created?.status).toBe(202);
    expect(
      store.writes.some((sql) => sql.includes("INSERT INTO member_subscriptions")),
    ).toBe(true);
    expect(square).toHaveBeenCalledWith(
      expect.stringContaining("/subscriptions/subscription-21/cancel"),
      expect.objectContaining({ method: "POST" }),
    );
    square.mockRestore();
  });

  it("does not accept a withdrawal when Square has not confirmed cancellation", async () => {
    const secret = "server-side-secret";
    const store = deletionDatabase(await hashPassword("correct-password", undefined, secret));
    const env = { DB: store.db, AUTH_SECRET: secret, SQUARE_ACCESS_TOKEN: "square-token" } as SitesEnv;
    const square = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ subscription: { id: "subscription-21", status: "ACTIVE" } }));

    const response = await handleAuthRequest(request("POST", {
      password: "correct-password",
      requestType: "withdrawal",
      understandSquareChange: true,
      understandDataHandling: true,
    }), env);

    expect(response?.status).toBe(502);
    expect(store.pending()).toBeNull();
    expect(store.writes.some((sql) => sql.includes("INSERT INTO account_deletion_requests"))).toBe(false);
    square.mockRestore();
  });

  it("completes a pause only after Square returns a scheduled PAUSE action", async () => {
    const secret = "server-side-secret";
    const store = deletionDatabase(await hashPassword("correct-password", undefined, secret));
    const env = { DB: store.db, AUTH_SECRET: secret, SQUARE_ACCESS_TOKEN: "square-token" } as SitesEnv;
    const square = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      subscription: { id: "subscription-21", status: "ACTIVE" },
      actions: [{ type: "PAUSE", effective_date: "2026-11-01" }],
    }));

    const response = await handleAuthRequest(request("POST", {
      password: "correct-password",
      requestType: "pause",
      reasons: ["しばらく参加できない"],
      understandSquareChange: true,
      understandDataHandling: true,
      source: "app",
    }), env);

    expect(response?.status).toBe(202);
    expect((await response?.json())?.request).toMatchObject({
      status: "completed",
      requestType: "pause",
      squareAction: "pause_scheduled",
      squareEffectiveDate: "2026-11-01",
    });
    expect(square).toHaveBeenCalledWith(expect.stringContaining("/pause"), expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("pause_reason"),
    }));
    square.mockRestore();
  });
});
