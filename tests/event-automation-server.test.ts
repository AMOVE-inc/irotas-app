import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/0015_event_automation.sql", "utf8");
const automation = readFileSync("sites/home-automation.ts", "utf8");
const worker = readFileSync("sites/worker.ts", "utf8");
const wrangler = readFileSync("sites/wrangler.json", "utf8");
const events = readFileSync("sites/events.ts", "utf8");
const home = readFileSync("app/(tabs)/index.tsx", "utf8");

describe("server event automation", () => {
  it("stores each reminder delivery once and advances the schema", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS event_automation_deliveries");
    expect(migration).toContain("UNIQUE(event_id, target_member_id, kind)");
    expect(migration).toContain("status TEXT NOT NULL DEFAULT 'pending'");
    expect(migration).toContain("SET value = '16'");
  });

  it("runs every fifteen minutes without blocking the home timeline", () => {
    expect(JSON.parse(wrangler).triggers.crons).toEqual(["*/15 * * * *"]);
    expect(worker).toContain("async scheduled");
    expect(worker).toContain("runEventAutomation(env.DB)");
    expect(automation).not.toContain("await runEventAutomation(env.DB);\n  return json({ activities:");
  });

  it("catches up overdue event XP when an active member opens the app", () => {
    expect(worker).toContain('requestUrl.pathname === "/api/auth/me"');
    expect(worker).toContain('/^\\/api\\/events\\/[^/]+$/.test(requestUrl.pathname)');
    expect(worker).toContain("await runEventAutomation(env.DB!)");
    expect(worker).toContain("lastOpportunisticEventAutomationAt");
  });

  it("creates organizer, favorite and participant reminders idempotently", () => {
    expect(automation).toContain("organizer_three_days");
    expect(automation).toContain("favorite_one_day");
    expect(automation).toContain("seven_days");
    expect(automation).toContain("INSERT OR IGNORE INTO event_automation_deliveries");
    expect(automation).toContain("INSERT OR IGNORE INTO chat_messages");
    expect(automation).toContain("event-reminder-message:${reminder.event.id}:${reminder.kind}");
    expect(automation).toContain("ON CONFLICT(room_id, member_id) DO UPDATE SET left_at = NULL");
  });

  it("automatically completes events and awards XP at the scheduled start", () => {
    expect(automation).toContain("if (now < start) continue");
    expect(automation).toContain("INSERT OR IGNORE INTO event_attendance_confirmations");
    expect(automation).toContain("INSERT OR IGNORE INTO event_attendance_finalizations");
    expect(automation).toContain('action: "event_completed_host"');
    expect(automation).toContain('action: "event_attendance"');
    expect(automation).not.toContain("XPは幹事が実出欠を確定した時点でのみ付与する");
    expect(home).toBeTruthy();
  });

  it("serves the home feed from shared server data", () => {
    expect(automation).toContain('/api/home/activities');
    expect(automation).toContain("FROM board_threads");
    expect(automation).toContain("!DELETED_EVENT_IDS.has(String(row.id))");
    expect(automation).toContain("t.category IN ('gourmet-contest','meal-report','gourmet-report','gourmet-advice','gourmet-consultation','free-chat')");
    expect(automation).toContain(".slice(0, 100)");
    expect(home).toContain("Api.getHomeActivities()");
  });

  it("persists participant finalization and event chat membership", () => {
    expect(events).toContain("EVENT_FINALIZE_PATH");
    expect(events).toContain("event.participants_finalized");
    expect(events).toContain("participantsFinalizedAt");
    expect(events).toContain("INSERT INTO chat_room_members");
    expect(events).toContain("ON CONFLICT(room_id, member_id) DO UPDATE");
    expect(events).toContain("event-chat-join:");
    expect(events).toContain("がチャットに参加しました");
    expect(events).toContain("参加者専用グループが作成されました");
    expect(events).toContain("【IRO+ システム】");
  });
});
