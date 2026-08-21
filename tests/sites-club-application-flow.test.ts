import { beforeEach, describe, expect, it, vi } from "vitest";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

const { authenticatedRequestMember } = vi.hoisted(() => ({ authenticatedRequestMember: vi.fn() }));

vi.mock("../sites/auth", () => ({ authenticatedRequestMember }));

import { canMemberAccessClub, handleClubRequest } from "../sites/clubs";

type TestMember = {
  id: number;
  public_member_id: string;
  display_name: string;
  account_status: "active";
};

type TestMembership = {
  club_id: string;
  member_id: number;
  status: "pending" | "on_hold" | "approved" | "rejected" | "left";
  wants_to_do: string;
  message_to_leader: string;
  applied_at: string;
};

const normalize = (query: string) => query.replace(/\s+/g, " ").trim();

class ClubFlowDatabase implements D1Database {
  readonly club = {
    id: "club-bread",
    name: "パン部",
    description: "パン屋巡りを楽しむ部活動です。",
    icon: "🍞",
    leader_member_id: 20,
    leader_public_member_id: "IRO0020",
    leader_display_name: "部長",
    status: "active" as const,
  };

  readonly members = new Map<number, TestMember>([
    [10, { id: 10, public_member_id: "IRO0010", display_name: "申請者", account_status: "active" }],
    [20, { id: 20, public_member_id: "IRO0020", display_name: "部長", account_status: "active" }],
    [30, { id: 30, public_member_id: "IRO0030", display_name: "他部活の部長", account_status: "active" }],
    [40, { id: 40, public_member_id: "IRO0040", display_name: "一般メンバー", account_status: "active" }],
  ]);

  readonly memberships = new Map<string, TestMembership>();
  readonly notifications: Array<{ targetMemberId: number; type: string; clubId: string }> = [];
  readonly audits: Array<{ action: string; clubId: string }> = [];

  prepare(query: string): D1PreparedStatement {
    const sql = normalize(query);
    let values: unknown[] = [];
    const statement: D1PreparedStatement = {
      bind: (...bound: unknown[]) => {
        values = bound;
        return statement;
      },
      first: async <T>() => this.first(sql, values) as T | null,
      all: async <T>() => ({ success: true, results: this.all(sql, values) as T[] }),
      run: async () => {
        this.run(sql, values);
        return { success: true };
      },
    };
    return statement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]) {
    return Promise.all(statements.map((statement) => statement.run<T>()));
  }

  private membershipKey(clubId: string, memberId: number) {
    return `${clubId}:${memberId}`;
  }

  private first(sql: string, values: unknown[]) {
    if (sql.includes("FROM clubs c LEFT JOIN members leader")) {
      return values[0] === this.club.id ? this.club : null;
    }
    if (sql.startsWith("SELECT status FROM club_memberships")) {
      const membership = this.memberships.get(this.membershipKey(String(values[0]), Number(values[1])));
      return membership ? { status: membership.status } : null;
    }
    if (sql.startsWith("SELECT display_name FROM members")) {
      const member = this.members.get(Number(values[0]));
      return member ? { display_name: member.display_name } : null;
    }
    if (sql.startsWith("SELECT id FROM members WHERE public_member_id")) {
      const member = [...this.members.values()].find((item) => item.public_member_id === values[0]);
      return member ? { id: member.id } : null;
    }
    if (sql.startsWith("SELECT 1 AS allowed FROM clubs c")) {
      const memberId = Number(values[0]);
      const clubId = String(values[1]);
      const isLeader = Number(values[2]) === this.club.leader_member_id;
      const membership = this.memberships.get(this.membershipKey(clubId, memberId));
      return clubId === this.club.id && (isLeader || membership?.status === "approved") ? { allowed: 1 } : null;
    }
    return null;
  }

  private all(sql: string, values: unknown[]) {
    if (!sql.includes("FROM club_memberships cm JOIN members m")) return [];
    const clubIds = new Set(values.map(String));
    return [...this.memberships.values()]
      .filter((membership) => clubIds.has(membership.club_id))
      .map((membership) => ({
        ...membership,
        public_member_id: this.members.get(membership.member_id)?.public_member_id ?? null,
      }));
  }

  private run(sql: string, values: unknown[]) {
    if (sql.startsWith("INSERT INTO club_memberships")) {
      const [clubId, memberId, wantsToDo, messageToLeader, appliedAt] = values;
      this.memberships.set(this.membershipKey(String(clubId), Number(memberId)), {
        club_id: String(clubId),
        member_id: Number(memberId),
        status: "pending",
        wants_to_do: String(wantsToDo),
        message_to_leader: String(messageToLeader),
        applied_at: String(appliedAt),
      });
      return;
    }
    if (sql.startsWith("UPDATE club_memberships SET status")) {
      const [status, , , , , clubId, memberId] = values;
      const key = this.membershipKey(String(clubId), Number(memberId));
      const membership = this.memberships.get(key);
      if (membership) membership.status = status as TestMembership["status"];
      return;
    }
    if (sql.startsWith("INSERT INTO audit_logs")) {
      this.audits.push({ action: String(values[1]), clubId: String(values[2]) });
      return;
    }
    if (sql.startsWith("INSERT INTO in_app_notifications")) {
      this.notifications.push({ targetMemberId: Number(values[1]), type: String(values[2]), clubId: String(values[5]) });
    }
  }
}

function sessionMember(id: number, accessRole: "member" | "club_leader" = "member") {
  return {
    id,
    role: "user",
    access_role: accessRole,
    account_status: "active",
  };
}

function jsonRequest(path: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
  return new Request(`https://app.example${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("club application lifecycle", () => {
  let db: ClubFlowDatabase;
  let env: SitesEnv;

  beforeEach(() => {
    db = new ClubFlowDatabase();
    env = { DB: db } as unknown as SitesEnv;
    authenticatedRequestMember.mockReset();
  });

  it("prevents duplicate applications, limits approval to the assigned leader, and unlocks access after approval", async () => {
    authenticatedRequestMember.mockResolvedValue(sessionMember(10));
    const application = { wantsToDo: "パン屋巡り", messageToLeader: "参加したいです" };
    const firstResponse = await handleClubRequest(
      jsonRequest("/api/clubs/club-bread/applications", "POST", application),
      env,
    );
    expect(firstResponse?.status).toBe(201);
    expect(db.memberships.get("club-bread:10")?.status).toBe("pending");
    expect(db.notifications).toEqual([{ targetMemberId: 20, type: "club_application", clubId: "club-bread" }]);

    const duplicateResponse = await handleClubRequest(
      jsonRequest("/api/clubs/club-bread/applications", "POST", application),
      env,
    );
    expect(duplicateResponse?.status).toBe(409);
    expect(db.notifications).toHaveLength(1);

    authenticatedRequestMember.mockResolvedValue(sessionMember(30, "club_leader"));
    const unrelatedLeaderResponse = await handleClubRequest(
      jsonRequest("/api/clubs/club-bread/applications/IRO0010", "PATCH", { action: "approve" }),
      env,
    );
    expect(unrelatedLeaderResponse?.status).toBe(403);
    expect(db.memberships.get("club-bread:10")?.status).toBe("pending");

    authenticatedRequestMember.mockResolvedValue(sessionMember(20, "club_leader"));
    const approvalResponse = await handleClubRequest(
      jsonRequest("/api/clubs/club-bread/applications/IRO0010", "PATCH", { action: "approve" }),
      env,
    );
    expect(approvalResponse?.status).toBe(200);
    expect(db.memberships.get("club-bread:10")?.status).toBe("approved");
    expect(db.notifications).toContainEqual({ targetMemberId: 10, type: "club_approval", clubId: "club-bread" });
    await expect(canMemberAccessClub(db, "club-bread", 10)).resolves.toBe(true);
    await expect(canMemberAccessClub(db, "club-bread", 40)).resolves.toBe(false);
  });

  it("only exposes a pending applicant to that applicant and the assigned leader", async () => {
    db.memberships.set("club-bread:10", {
      club_id: "club-bread",
      member_id: 10,
      status: "pending",
      wants_to_do: "パン屋巡り",
      message_to_leader: "参加したいです",
      applied_at: "2026-08-21T12:00:00.000Z",
    });

    authenticatedRequestMember.mockResolvedValue(sessionMember(40));
    const outsiderResponse = await handleClubRequest(new Request("https://app.example/api/clubs/club-bread"), env);
    const outsiderBody = await outsiderResponse?.json() as { club: { applicantIds: string[]; applications: unknown[] } };
    expect(outsiderBody.club.applicantIds).toEqual([]);
    expect(outsiderBody.club.applications).toEqual([]);

    authenticatedRequestMember.mockResolvedValue(sessionMember(10));
    const applicantResponse = await handleClubRequest(new Request("https://app.example/api/clubs/club-bread"), env);
    const applicantBody = await applicantResponse?.json() as { club: { applicantIds: string[]; applications: unknown[] } };
    expect(applicantBody.club.applicantIds).toEqual(["IRO0010"]);
    expect(applicantBody.club.applications).toHaveLength(1);

    authenticatedRequestMember.mockResolvedValue(sessionMember(20, "club_leader"));
    const leaderResponse = await handleClubRequest(new Request("https://app.example/api/clubs/club-bread"), env);
    const leaderBody = await leaderResponse?.json() as { club: { applicantIds: string[]; applications: unknown[] } };
    expect(leaderBody.club.applicantIds).toEqual(["IRO0010"]);
    expect(leaderBody.club.applications).toHaveLength(1);
  });
});
