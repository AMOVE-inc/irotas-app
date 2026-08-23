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

  it("runs every fifteen minutes and also catches up when home loads", () => {
    expect(JSON.parse(wrangler).triggers.crons).toEqual(["*/15 * * * *"]);
    expect(worker).toContain("async scheduled");
    expect(worker).toContain("runEventAutomation(env.DB)");
    expect(automation).toContain("await runEventAutomation(env.DB)");
  });

  it("creates organizer, favorite and participant reminders idempotently", () => {
    expect(automation).toContain("organizer_three_days");
    expect(automation).toContain("favorite_one_day");
    expect(automation).toContain("seven_days");
    expect(automation).toContain("INSERT OR IGNORE INTO event_automation_deliveries");
    expect(automation).toContain("INSERT OR IGNORE INTO chat_messages");
  });

  it("serves the home feed from shared server data", () => {
    expect(automation).toContain('/api/home/activities');
    expect(automation).toContain("FROM board_threads");
    expect(automation).toContain("FROM chat_messages");
    expect(home).toContain("Api.getHomeActivities()");
  });

  it("persists participant finalization and event chat membership", () => {
    expect(events).toContain("EVENT_FINALIZE_PATH");
    expect(events).toContain("event.participants_finalized");
    expect(events).toContain("participantsFinalizedAt");
    expect(events).toContain("INSERT INTO chat_room_members");
    expect(events).toContain("ON CONFLICT(room_id, member_id) DO UPDATE");
  });
});
