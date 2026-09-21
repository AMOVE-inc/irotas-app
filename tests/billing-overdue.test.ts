import { afterEach, describe, expect, it, vi } from "vitest";
import { billingOverdueFollowUpMessage, nextAutomaticFollowUp, overdueSubscriptionInvoices, reconcileOverdueInvoices } from "../sites/billing-overdue";

afterEach(() => vi.unstubAllGlobals());

describe("会費の期限超過判定", () => {
  it("初回通知後も未払いなら7日後に一度だけ再通知する", () => {
    expect(nextAutomaticFollowUp("2026-09-21", null, false)).toBe("initial");
    expect(nextAutomaticFollowUp("2026-09-27", "2026-09-21T00:00:00.000Z", false)).toBeNull();
    expect(nextAutomaticFollowUp("2026-09-28", "2026-09-21T00:00:00.000Z", false)).toBe("week_1");
    expect(nextAutomaticFollowUp("2026-10-01", "2026-09-21T00:00:00.000Z", true)).toBeNull();
  });

  it("承認済みの初回・7日後メール文面を使用する", () => {
    const initial = billingOverdueFollowUpMessage("山田 花子", "initial");
    expect(initial.subject).toBe("【IRO+】会費のお支払い状況をご確認ください");
    expect(initial.text).toContain("山田 花子 様");
    expect(initial.text).toContain("アプリへのログイン・閲覧を一時停止しています");
    expect(initial.text).toContain("通常15分以内にアプリを再びご利用いただけます");

    const week = billingOverdueFollowUpMessage("山田 花子", "week_1");
    expect(week.subject).toBe("【再案内／IRO+】会費のお支払い状況をご確認ください");
    expect(week.text).toContain("先日、IRO+会費のお支払いについてご案内しました");
    expect(week.text).toContain("引き続き一時停止しています");
  });

  it("支払期限を過ぎたサブスク請求書だけを抽出する", () => {
    const result = overdueSubscriptionInvoices([
      { id: "old", invoice_number: "006001", subscription_id: "member-sub", status: "UNPAID", payment_requests: [{ due_date: "2026-09-19" }] },
      { id: "partial", invoice_number: "006002", subscription_id: "member-sub", status: "PARTIALLY_PAID", payment_requests: [{ due_date: "2026-09-18" }] },
      { id: "today", subscription_id: "member-sub", status: "UNPAID", payment_requests: [{ due_date: "2026-09-20" }] },
      { id: "paid", subscription_id: "member-sub", status: "PAID", payment_requests: [{ due_date: "2026-09-01" }] },
      { id: "cancelled", subscription_id: "member-sub", status: "CANCELED", payment_requests: [{ due_date: "2026-09-01" }] },
      { id: "event", status: "UNPAID", payment_requests: [{ due_date: "2026-09-01" }] },
    ], "2026-09-20");
    expect([...result.entries()]).toEqual([["member-sub", { count: 2, invoiceNumbers: ["006001", "006002"], oldestDue: "2026-09-18" }]]);
  });

  it("会費の期限超過だけを閲覧制限対象として記録する", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ invoices: [
      { id: "inv-1", subscription_id: "sub-1", status: "UNPAID", payment_requests: [{ due_date: "2026-09-19" }] },
      { id: "leader-invoice", subscription_id: "sub-leader", status: "UNPAID", payment_requests: [{ due_date: "2026-09-19" }] },
      { id: "event-invoice", status: "UNPAID", payment_requests: [{ due_date: "2026-09-18" }] },
    ] })));
    const writes: { sql: string; values: unknown[] }[] = [];
    const db = {
      prepare(sql: string) {
        const statement = { sql, values: [] as unknown[], bind(...values: unknown[]) { this.values = values; return this; },
          async all() { return { results: [
            { id: 1, square_subscription_id: "sub-1", square_status: "ACTIVE", billing_status: "CURRENT", access_status: "active" },
            { id: 2, square_subscription_id: "sub-2", square_status: "ACTIVE", billing_status: "CURRENT", access_status: "suspended" },
            { id: 3, square_subscription_id: "sub-leader", square_status: "ACTIVE", billing_status: "CURRENT", access_status: "active", role: "user", access_role: "club_leader", account_status: "active" },
          ] }; } };
        return statement;
      },
      async batch(statements: { sql: string; values: unknown[] }[]) { writes.push(...statements); return []; },
    };
    const result = await reconcileOverdueInvoices({ DB: db as never, SQUARE_ACCESS_TOKEN: "test", SQUARE_LOCATION_ID: "loc", ASSETS: {} as never }, new Date("2026-09-20T00:00:00+09:00"));
    expect(result).toMatchObject({ overdueSubscriptions: 1, updatedSubscriptions: 1 });
    expect(writes).toHaveLength(1);
    expect(writes[0].values[0]).toBe("OVERDUE_BLOCKED");
    expect(writes[0].values.at(-1)).toBe(1);
  });

  it("請求書の支払い・取消し後は制限を解除し、別の決済失敗状態は変更しない", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ invoices: [
      { id: "paid", subscription_id: "sub-1", status: "PAID", payment_requests: [{ due_date: "2026-09-19" }] },
      { id: "cancelled", subscription_id: "sub-2", status: "CANCELED", payment_requests: [{ due_date: "2026-09-18" }] },
      { id: "current", subscription_id: "sub-3", status: "UNPAID", payment_requests: [{ due_date: "2026-09-20" }] },
    ] })));
    const writes: { sql: string; values: unknown[] }[] = [];
    const db = {
      prepare(sql: string) {
        return { sql, values: [] as unknown[], bind(...values: unknown[]) { this.values = values; return this; },
          async all() { return { results: [
            { id: 1, square_subscription_id: "sub-1", square_status: "ACTIVE", billing_status: "OVERDUE_BLOCKED", access_status: "active" },
            { id: 2, square_subscription_id: "sub-2", square_status: "ACTIVE", billing_status: "OVERDUE_BLOCKED", access_status: "active" },
            { id: 3, square_subscription_id: "sub-3", square_status: "ACTIVE", billing_status: "PAYMENT_FAILED", access_status: "grace" },
            { id: 4, square_subscription_id: "sub-4", square_status: "ACTIVE", billing_status: "PAYMENT_FAILED", access_status: "active" },
          ] }; } };
      },
      async batch(statements: { sql: string; values: unknown[] }[]) { writes.push(...statements); return []; },
    };
    await reconcileOverdueInvoices({ DB: db as never, SQUARE_ACCESS_TOKEN: "test", SQUARE_LOCATION_ID: "loc", ASSETS: {} as never }, new Date("2026-09-20T00:00:00+09:00"));
    expect(writes.map((write) => write.values.at(-1))).toEqual([1, 2, 4]);
    expect(writes.every((write) => write.sql.includes("billing_status = 'CURRENT'"))).toBe(true);
  });
});
