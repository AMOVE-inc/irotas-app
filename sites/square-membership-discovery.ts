import type { D1Database, SitesEnv } from "./platform-types";
import { subscriptionAccessState } from "./square-sync";

type Customer = { id: string; email_address?: string };
type Subscription = { id: string; customer_id?: string; plan_variation_id?: string; status?: string; start_date?: string; charged_through_date?: string };
type CatalogObject = {
  subscription_plan_data?: { name?: string };
  subscription_plan_variation_data?: { name?: string };
};

export type SquareMembershipDiscovery = { found: boolean; memberTerm: string | null };

export function memberTermFromSquareCatalog(objects: CatalogObject[]) {
  for (const object of objects) {
    const names = [object.subscription_plan_data?.name, object.subscription_plan_variation_data?.name];
    for (const name of names) {
      const match = name?.normalize("NFKC").match(/第\s*([1-9]\d?)\s*期/);
      if (match) return `第${Number(match[1])}期`;
    }
  }
  return null;
}

// Called only after mailbox ownership has been verified. Discovery supplements
// imports; it never treats an unrelated purchase as an active membership.
export async function discoverSquareMembership(db: D1Database, env: SitesEnv, email: string): Promise<SquareMembershipDiscovery> {
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
    if (!customers.length) return { found: false, memberTerm: null };
    const ids = new Set(customers.map(c => c.id));
    const subscriptions = await search<Subscription>("subscriptions", { filter: { customer_ids: [...ids] } }, "subscriptions");
    const allowed = new Set((env.SQUARE_ALLOWED_PLAN_VARIATION_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean));
    const selected = subscriptions.filter(s => s.id && s.customer_id && ids.has(s.customer_id) && subscriptionAccessState(s, allowed).accessStatus === "active")
      .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? "") || a.id.localeCompare(b.id))[0];
    if (!selected) return { found: false, memberTerm: null };
    const state = subscriptionAccessState(selected, allowed);
    const now = new Date().toISOString();
    let memberTerm: string | null = null;
    if (selected.plan_variation_id) {
      // The cohort is part of the Square subscription plan name (for example
      // "IRO+（第7期）"). Failure to load optional catalog metadata must not
      // block an otherwise valid membership from being linked.
      try {
        const response = await fetch(`https://connect.squareup.com/v2/catalog/object/${encodeURIComponent(selected.plan_variation_id)}?include_related_objects=true`, {
          headers: { authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "content-type": "application/json", "square-version": "2026-07-15" },
          signal: AbortSignal.timeout(15000),
        });
        if (response.ok) {
          const body = await response.json() as { object?: CatalogObject; related_objects?: CatalogObject[] };
          memberTerm = memberTermFromSquareCatalog([...(body.object ? [body.object] : []), ...(body.related_objects ?? [])]);
        }
      } catch { /* The active subscription remains authoritative for access. */ }
    }
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
    if (memberTerm) {
      await db.prepare(`UPDATE members
        SET member_term = COALESCE(NULLIF(TRIM(member_term), ''), ?), updated_at = ?
        WHERE LOWER(TRIM(email)) = ?`)
        .bind(memberTerm, now, email).run();
    }
    return { found: true, memberTerm };
  } catch {
    throw new Error("square_lookup_failed");
  }
}
