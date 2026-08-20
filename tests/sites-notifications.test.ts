import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../sites/auth", () => ({
  authenticatedRequestMember: vi.fn(),
}));

import { authenticatedRequestMember } from "../sites/auth";
import { handleNotificationRequest } from "../sites/notifications";
import type { D1Database, D1PreparedStatement } from "../sites/platform-types";

type Row = {
  id: string;
  target_member_id: number;
  type: string;
  title: string;
  body: string;
  club_id: string | null;
  event_id: string | null;
  read_at: string | null;
  created_at: string;
};

class NotificationDb implements D1Database {
  constructor(public rows: Row[]) {}

  prepare(query: string): D1PreparedStatement {
    const db = this;
    let values: unknown[] = [];
    return {
      bind(...next: unknown[]) { values = next; return this; },
      async all<T>() {
        const memberId = Number(values[0]);
        return { results: db.rows.filter((row) => row.target_member_id === memberId) as T[] };
      },
      async first<T>() {
        if (!query.includes("FROM in_app_notifications")) return null;
        const [, id, memberId] = values;
        return (db.rows.find((row) => row.id === id && row.target_member_id === Number(memberId)) ?? null) as T | null;
      },
      async run<T>() {
        if (query.includes("target_member_id = ? AND read_at IS NULL")) {
          const [readAt, memberId] = values;
          db.rows = db.rows.map((row) => row.target_member_id === Number(memberId) && !row.read_at ? { ...row, read_at: String(readAt) } : row);
        } else if (query.includes("WHERE id = ? AND target_member_id = ?")) {
          const [readAt, id, memberId] = values;
          db.rows = db.rows.map((row) => row.id === id && row.target_member_id === Number(memberId) ? { ...row, read_at: row.read_at ?? String(readAt) } : row);
        }
        return { success: true } as T;
      },
    };
  }

  async batch<T>() { return [] as T[]; }
}

const notification = (id: string, target: number): Row => ({
  id,
  target_member_id: target,
  type: "club_application",
  title: "入部申請が届きました",
  body: "申請内容を確認してください",
  club_id: "club-wine",
  event_id: null,
  read_at: null,
  created_at: "2026-08-20T12:00:00.000Z",
});

describe("notification API ownership", () => {
  beforeEach(() => {
    vi.mocked(authenticatedRequestMember).mockResolvedValue({ id: 10, role: "user", access_role: "member", account_status: "active" });
  });

  it("returns only the signed-in member's notifications", async () => {
    const db = new NotificationDb([notification("own", 10), notification("other", 11)]);
    const response = await handleNotificationRequest(new Request("https://app.example/api/notifications"), { DB: db } as never);
    expect(response?.status).toBe(200);
    const body = await response?.json() as { notifications: Array<{ id: string }> };
    expect(body.notifications.map((item) => item.id)).toEqual(["own"]);
  });

  it("does not allow a member to mark another member's notification as read", async () => {
    const db = new NotificationDb([notification("other", 11)]);
    const response = await handleNotificationRequest(new Request("https://app.example/api/notifications/other", { method: "PATCH" }), { DB: db } as never);
    expect(response?.status).toBe(404);
    expect(db.rows[0].read_at).toBeNull();
  });

  it("marks all unread notifications for only the signed-in member", async () => {
    const db = new NotificationDb([notification("own", 10), notification("other", 11)]);
    const response = await handleNotificationRequest(new Request("https://app.example/api/notifications/read-all", { method: "PATCH" }), { DB: db } as never);
    expect(response?.status).toBe(200);
    expect(db.rows.find((row) => row.id === "own")?.read_at).not.toBeNull();
    expect(db.rows.find((row) => row.id === "other")?.read_at).toBeNull();
  });
});
