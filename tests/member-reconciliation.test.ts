import { describe, expect, it } from "vitest";
import { buildMemberReconciliationReport, handleMemberImportRequest } from "../sites/member-import";

describe("member reconciliation report", () => {
  it("returns aggregate-only matching results and counts blockers", () => {
    const report = buildMemberReconciliationReport({
      members: {
        active_members: 500,
        active_general_members: 489,
        discord_linked_members: 493,
        members_without_subscription: 3,
      },
      subscriptions: { subscriptions: 492, linked_subscriptions: 490 },
      duplicates: [
        { count: 0 },
        { count: 1 },
        { count: 0 },
        { count: 2 },
        { count: 0 },
      ],
      lastImport: {
        status: "completed",
        imported_count: 25,
        error_count: 0,
        completed_at: "2026-08-23T00:00:00.000Z",
      },
    });

    expect(report).toMatchObject({
      activeMembers: 500,
      discordLinkedMembers: 493,
      discordMissingMembers: 7,
      linkedSubscriptions: 490,
      unlinkedSubscriptions: 2,
      membersWithoutSubscription: 3,
      duplicateDiscordIdGroups: 1,
      duplicateSquareCustomerIdGroups: 2,
      blockingIssueCount: 8,
    });
    expect(JSON.stringify(report)).not.toMatch(/@|customer-|subscription-/i);
  });

  it("handles an empty database without negative counts", () => {
    expect(buildMemberReconciliationReport({ members: null, subscriptions: null, duplicates: [], lastImport: null })).toMatchObject({
      activeMembers: 0,
      discordMissingMembers: 0,
      unlinkedSubscriptions: 0,
      blockingIssueCount: 0,
      lastImport: null,
    });
  });

  it("does not expose the reconciliation endpoint without authentication", async () => {
    const response = await handleMemberImportRequest(
      new Request("https://app.example.test/api/admin/member-import/reconciliation"),
      { DB: {} } as never,
    );
    expect(response?.status).toBe(401);
  });
});
