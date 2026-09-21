import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverSquareMembership, memberTermFromSquareCatalog } from "../sites/square-membership-discovery";
afterEach(() => vi.restoreAllMocks());
const email = "member@example.test";
const customer = { id: "customer-1", email_address: email };
const active = { id: "sub-1", customer_id: customer.id, status: "ACTIVE", plan_variation_id: "membership", start_date: "2026-09-01" };
function fixture(bodies: unknown[]) {
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  const fetch = vi.spyOn(globalThis, "fetch");
  for (const body of bodies) fetch.mockResolvedValueOnce(Response.json(body));
  const invoke = () => discoverSquareMembership({ prepare } as never, { SQUARE_ACCESS_TOKEN: "test", SQUARE_ALLOWED_PLAN_VARIATION_IDS: "membership" } as never, email);
  return { invoke, run, bind, prepare, fetch };
}
describe("Square discovery for missing membership imports", () => {
  it("searches all customer/subscription pages and selects an active membership", async () => {
    const f = fixture([{ customers: [], cursor: "customers-next" }, { customers: [customer] }, { subscriptions: [{ ...active, status: "CANCELED" }], cursor: "subscriptions-next" }, { subscriptions: [active] }]);
    expect(await f.invoke()).toEqual({ found: true, memberTerm: null });
    expect(f.fetch).toHaveBeenCalledTimes(5);
    expect(JSON.parse(String(f.fetch.mock.calls[1][1]?.body)).cursor).toBe("customers-next");
    expect(JSON.parse(String(f.fetch.mock.calls[2][1]?.body)).query.filter.customer_ids).toEqual([customer.id]);
    expect(f.bind.mock.calls[0].slice(0, 5)).toEqual([email, customer.id, active.id, "membership", "ACTIVE"]);
    expect(f.prepare.mock.calls[0][0]).toContain("access_status = 'grace' THEN 'grace'");
  });
  it("does not link another email returned by a broad provider match", async () => {
    const f = fixture([{ customers: [{ ...customer, email_address: "other@example.test" }] }]);
    expect(await f.invoke()).toEqual({ found: false, memberTerm: null });
    expect(f.run).not.toHaveBeenCalled();
  });
  it.each(["CANCELED", "PAUSED", "PENDING"])("does not grant membership for %s subscriptions", async status => {
    const f = fixture([{ customers: [customer] }, { subscriptions: [{ ...active, status }] }]);
    expect(await f.invoke()).toEqual({ found: false, memberTerm: null });
    expect(f.run).not.toHaveBeenCalled();
  });
  it("does not grant membership from an unrelated plan", async () => {
    const f = fixture([{ customers: [customer] }, { subscriptions: [{ ...active, plan_variation_id: "other" }] }]);
    expect(await f.invoke()).toEqual({ found: false, memberTerm: null });
    expect(f.run).not.toHaveBeenCalled();
  });
  it("reports upstream failure instead of classifying a member as absent", async () => {
    const f = fixture([]);
    f.fetch.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(f.invoke()).rejects.toThrow("square_lookup_failed");
    expect(f.run).not.toHaveBeenCalled();
  });
  it("keeps conflicting existing Square identity links intact", async () => {
    const f = fixture([{ customers: [customer] }, { subscriptions: [active] }]);
    f.run.mockRejectedValue(new Error("UNIQUE constraint failed"));
    await expect(f.invoke()).rejects.toThrow("square_lookup_failed");
    expect(f.prepare).toHaveBeenCalledOnce();
  });
  it("reads the member term from the related Square subscription plan", () => {
    expect(memberTermFromSquareCatalog([
      { subscription_plan_variation_data: { name: "月ごと" } },
      { subscription_plan_data: { name: "IRO+（第7期）" } },
    ])).toBe("第7期");
  });
});
