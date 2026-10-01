import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import {
  handleMemberStartMissionRequest,
  INTRODUCTION_MISSION_CUTOFF,
  introductionMissionCompletionSql,
  startMissionStepsFromRow,
} from "../sites/member-start-missions";
import type { D1Database, D1PreparedStatement, D1Result, SitesEnv } from "../sites/platform-types";

const { authenticatedRequestMember } = vi.hoisted(() => ({ authenticatedRequestMember: vi.fn() }));
vi.mock("../sites/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sites/auth")>()), authenticatedRequestMember,
}));

function missionDatabase() {
  const state = {
    xp: 100,
    guideSeenAt: null as string | null,
    rewards: new Map<string, { grantId: string; status: "pending" | "applied" }>(),
    auditCount: 0,
  };
  const db: D1Database = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement: D1PreparedStatement = {
        bind(...values) { params = values; return statement; },
        async first<T>() {
          if (sql.includes("FROM members m JOIN member_start_mission_state")) return {
            xp: state.xp, member_rank: "regular", guide_seen_at: state.guideSeenAt,
            profile_complete: 1, introduction_complete: 1, event_application_complete: 0,
            club_membership_complete: 0, meal_report_complete: 0, event_creation_complete: 0,
          } as T;
          if (sql.includes("SELECT xp FROM members")) return { xp: state.xp } as T;
          return null;
        },
        async run<T>() {
          if (sql.includes("SET guide_seen_at")) state.guideSeenAt = String(params[0]);
          if (sql.includes("INSERT OR IGNORE INTO member_start_mission_rewards")) {
            const key = String(params[1]);
            if (!state.rewards.has(key)) state.rewards.set(key, { grantId: String(params[2]), status: "pending" });
          }
          if (sql.includes("UPDATE members SET") && sql.includes("member_start_mission_rewards")) {
            const grantId = String(params[1]);
            const pending = [...state.rewards.values()].filter((reward) => reward.grantId === grantId && reward.status === "pending").length;
            state.xp += pending * 10;
          }
          if (sql.includes("UPDATE member_start_mission_rewards SET status = 'applied'")) {
            const grantId = String(params[2]);
            for (const reward of state.rewards.values()) if (reward.grantId === grantId && reward.status === "pending") reward.status = "applied";
          }
          if (sql.includes("member.start_mission_rewards_applied")) state.auditCount++;
          return { success: true, meta: { changes: 1 } } as T;
        },
        async all<T>() {
          if (sql.includes("SELECT mission_key FROM member_start_mission_rewards")) {
            const grantId = String(params[1]);
            return { success: true, results: [...state.rewards.entries()]
              .filter(([, reward]) => reward.grantId === grantId && reward.status === "applied")
              .map(([mission_key]) => ({ mission_key })) as T[] };
          }
          return { success: true, results: [] as T[] };
        },
      };
      return statement;
    },
    async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      return Promise.all(statements.map((statement) => statement.run<T>()));
    },
  };
  return { db, state };
}

describe("member start missions", () => {
  beforeEach(() => authenticatedRequestMember.mockResolvedValue({ id: 7, role: "user", access_role: "member", account_status: "active" }));
  it("tracks all six first-login achievements from server facts", () => {
    const steps = startMissionStepsFromRow({
      profile_complete: 1,
      introduction_complete: 1,
      event_application_complete: 1,
      club_membership_complete: 1,
      meal_report_complete: 1,
      event_creation_complete: 1,
    });
    expect(steps.map((step) => step.key)).toEqual([
      "profile", "introduction", "event_application", "club_membership", "meal_report", "event_creation",
    ]);
    expect(steps.every((step) => step.completed)).toBe(true);
  });

  it("does not treat missing server facts as completed", () => {
    expect(startMissionStepsFromRow({}).every((step) => !step.completed)).toBe(true);
  });

  it("grandfathers introductions before September and recognizes migrated Discord introductions", () => {
    expect(INTRODUCTION_MISSION_CUTOFF).toBe("2026-09-01");
    const sql = introductionMissionCompletionSql("member");
    expect(sql).toContain("member_id_assignments");
    expect(sql).toContain("member_subscriptions");
    expect(sql).toContain("subscription_started_at");
    expect(sql).toContain("member.discord_joined_at");
    expect(sql).toContain("< '2026-09-01'");
    expect(sql).toContain("discord_profile_snapshots");
    expect(sql).toContain("dps.has_profile_bio = 1");
    expect(sql).toContain("bt.category = 'introduction'");
    expect(sql).toContain("FROM chat_messages cm");
    expect(sql).toContain("cm.room_id = 'board-introduction'");
  });

  it("uses only achievements created after an explicit mission reset", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(
      resolve(process.cwd(), "sites/member-start-missions.ts"), "utf8",
    ));
    expect(source).toContain("julianday(s.profile_completed_at) > julianday(s.reset_at)");
    expect(source).toContain("julianday(bt.created_at) > julianday(s.reset_at)");
    expect(source).toContain("julianday(cm.created_at) > julianday(s.reset_at)");
    expect(source).toContain("julianday(ep.applied_at) > julianday(s.reset_at)");
    expect(source).toContain("julianday(cm.applied_at) > julianday(s.reset_at)");
    expect(source).toContain("julianday(e.created_at) > julianday(s.reset_at)");
  });

  it("awards 10 XP for each newly completed server mission exactly once", async () => {
    const { db, state } = missionDatabase();
    const env = { DB: db } as SitesEnv;
    const first = await handleMemberStartMissionRequest(new Request("https://app.example/api/member/start-missions"), env);
    expect(await first?.json()).toMatchObject({ bonusAwardedNow: true, reward: { amount: 20, previousXp: 100, nextXp: 120 } });
    expect(state.xp).toBe(120);
    expect(state.auditCount).toBe(1);

    const second = await handleMemberStartMissionRequest(new Request("https://app.example/api/member/start-missions"), env);
    expect(await second?.json()).toMatchObject({ bonusAwardedNow: false, reward: null });
    expect(state.xp).toBe(120);
    expect(state.auditCount).toBe(1);
  });

  it("stores the guide acknowledgement on the server", async () => {
    const { db, state } = missionDatabase();
    const response = await handleMemberStartMissionRequest(new Request("https://app.example/api/member/start-missions", {
      method: "POST", body: JSON.stringify({ action: "mark_seen" }),
    }), { DB: db } as SitesEnv);
    expect(response?.status).toBe(200);
    expect(state.guideSeenAt).not.toBeNull();
  });
});
