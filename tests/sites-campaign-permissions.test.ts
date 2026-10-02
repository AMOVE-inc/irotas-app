import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ viewer: null as null | Record<string, unknown> }));

vi.mock("../sites/auth", () => ({
  authenticatedRequestMember: vi.fn(async () => auth.viewer),
}));

import { handleCampaignRequest } from "../sites/campaigns";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

function database(): D1Database {
  const statement = {} as D1PreparedStatement;
  Object.assign(statement, {
    bind: vi.fn(() => statement),
    all: vi.fn(async () => ({ results: [] })),
    first: vi.fn(async () => null),
    run: vi.fn(async () => ({ success: true })),
  });
  return {
    prepare: vi.fn(() => statement),
    batch: vi.fn(async () => []),
  } as unknown as D1Database;
}

const campaign = {
  title: "秋のキャンペーン",
  description: "説明",
  targetRank: "all",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  status: "active",
  type: "points",
  reachCount: 0,
};

describe("campaign API permission contract", () => {
  beforeEach(() => { auth.viewer = null; });

  it("returns the stable 401 contract when unauthenticated", async () => {
    const response = await handleCampaignRequest(new Request("https://iro.test/api/campaigns/c1", { method: "PUT", body: JSON.stringify(campaign) }), { DB: database() } as SitesEnv);
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: "ログインが必要です" });
  });

  it("returns the stable 403 contract for an ordinary member", async () => {
    auth.viewer = { id: 1, role: "user", access_role: "member" };
    const response = await handleCampaignRequest(new Request("https://iro.test/api/campaigns/c1", { method: "PUT", body: JSON.stringify(campaign) }), { DB: database() } as SitesEnv);
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: "運営権限が必要です" });
  });

  it.each([
    { role: "operator", access_role: "operator" },
    { role: "admin", access_role: "admin" },
  ])("allows $access_role to save a valid campaign", async (role) => {
    const DB = database();
    auth.viewer = { id: 1, ...role };
    const response = await handleCampaignRequest(new Request("https://iro.test/api/campaigns/c1", { method: "PUT", body: JSON.stringify(campaign) }), { DB } as SitesEnv);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ success: true });
    expect(DB.batch).toHaveBeenCalledOnce();
  });
});
