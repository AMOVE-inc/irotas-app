import type { D1Database, SitesEnv } from "./platform-types";
import { subscriptionAccessState } from "./square-sync";

type Customer = { id: string; email_address?: string };
type Subscription = { id: string; customer_id?: string; plan_variation_id?: string; status?: string; start_date?: string; charged_through_date?: string };

// Called only after mailbox ownership has been verified. Discovery supplements
// imports; it never treats an unrelated purchase as an active membership.
export async function discoverSquareMembership(db: D1Database, env: SitesEnv, email: string) {
  if (!env.SQUARE_ACCESS_TOKEN) throw new Error("square_lookup_failed");
  async function search<T>(route: string, query: unknown, field: string): Promise<T[]> {
    const rows: T[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const response = await fetch(`https://connect.squareup.com/v2/${route}/search`, {
        method: "POST",
        headers: { authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "content-type": "application/json", "square-version": "2026-07-15" },
        body: JSON.stringify({ query, cursor, limit: 100 }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("square_lookup_failed");
      const body = await response.json() as Record<string, unknown>;
      if (body.errors || (body[field] !== undefined && !Array.isArray(body[field]))) throw new Error("square_lookup_failed");
      rows.push(...(body[field] as T[] ?? []));
      cursor = typeof body.cursor === "string" && body.cursor ? body.cursor : undefined;
      if (cursor && seen.has(cursor)) throw new Error("square_lookup_failed");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return rows;
  }
  try {
    const customers = (await search<Customer>("customers", { filter: { email_address: { exact: email } } }, "customers"))
      .filter(c => c.id && c.email_address?.trim().toLowerCase() === email);
    if (!customers.length) return false;
    const ids = new Set(customers.map(c => c.id));
    const subscriptions = await search<Subscription>("subscriptions", { filter: { customer_ids: [...ids] } }, "subscriptions");
    const allowed = new Set((env.SQUARE_ALLOWED_PLAN_VARIATION_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean));
    const selected = subscriptions.filter(s => s.id && s.customer_id && ids.has(s.customer_id) && subscriptionAccessState(s, allowed).accessStatus === "active")
      .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? "") || a.id.localeCompare(b.id))[0];
    if (!selected) return false;
    const state = subscriptionAccessState(selected, allowed);
    const now = new Date().toISOString();
    // Unique Square identity constraints deliberately reject conflicting links.
    // Existing grace periods and suspended member accounts remain authoritative.
    await db.prepare(`INSERT INTO member_subscriptions
      (billing_email, square_customer_id, square_subscription_id, plan_variation_id, square_status, access_status, paid_until_date, subscription_started_at, last_verified_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      ON CONFLICT(billing_email) DO UPDATE SET
        square_customer_id = excluded.square_customer_id,
        square_subscription_id = excluded.square_subscription_id,
        plan_variation_id = excluded.plan_variation_id,
        square_status = excluded.square_status,
        access_status = CASE WHEN member_subscriptions.access_status = 'grace' THEN 'grace' ELSE 'active' END,
        paid_until_date = excluded.paid_until_date,
        subscription_started_at = COALESCE(member_subscriptions.subscription_started_at, excluded.subscription_started_at),
        last_verified_at = excluded.last_verified_at, updated_at = excluded.updated_at`)
      .bind(email, selected.customer_id, selected.id, selected.plan_variation_id ?? null, state.status, state.paidUntil, selected.start_date ?? null, now, now).run();
    return true;
  } catch {
    throw new Error("square_lookup_failed");
  }
}
