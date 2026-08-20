import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/0009_in_app_notifications.sql", "utf8");
const clubHandler = readFileSync("sites/clubs.ts", "utf8");
const notificationHandler = readFileSync("sites/notifications.ts", "utf8");

describe("persistent in-app notifications", () => {
  it("stores notifications per member with unread and creation indexes", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS in_app_notifications");
    expect(migration).toContain("target_member_id INTEGER NOT NULL");
    expect(migration).toContain("read_at TEXT");
    expect(migration).toContain("idx_in_app_notifications_target_unread");
  });

  it("notifies the leader on application and the applicant on approval", () => {
    expect(clubHandler).toContain('"club_application"');
    expect(clubHandler).toContain('"club_approval"');
    expect(clubHandler).toContain("まずは${row.name}の自己紹介スレッドへ投稿しましょう");
  });

  it("only returns and updates notifications owned by the signed-in member", () => {
    expect(notificationHandler).toContain("WHERE target_member_id = ?");
    expect(notificationHandler).toContain("WHERE id = ? AND target_member_id = ?");
    expect(notificationHandler).toContain("/api/notifications/read-all");
  });
});
