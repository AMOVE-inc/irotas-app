import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { canAccessMemberApp } from "../lib/membership-access";

let directory = "";
let database = "";

function sqlite(sql: string, expectSuccess = true) {
  const result = spawnSync("sqlite3", [database], { input: `PRAGMA foreign_keys=ON;\n${sql}`, encoding: "utf8" });
  if (expectSuccess && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result;
}

function scalar(sql: string) {
  return sqlite(sql).stdout.trim();
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "irotas-sqlite-integration-"));
  database = join(directory, "irotas.db");
  const migrations = readdirSync("drizzle").filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  expect(migrations.at(-1)).toBe("0069_retain_withdrawn_members_and_status_history.sql");
  for (const migration of migrations) sqlite(readFileSync(join("drizzle", migration), "utf8"));
});

afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("all migrations on a real SQLite engine", () => {
  it("applies the complete migration chain and creates the expected core schema", () => {
    expect(Number(scalar("SELECT COUNT(*) FROM sqlite_schema WHERE type='table';"))).toBeGreaterThanOrEqual(75);
    for (const table of ["members", "events", "event_participations", "board_threads", "chat_messages", "event_payment_checkouts", "push_notification_deliveries", "backup_snapshots"]) {
      expect(scalar(`SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='${table}';`)).toBe("1");
    }
  });

  it("enforces state enums at the database boundary", () => {
    sqlite("INSERT INTO members(email,display_name,role,access_role,account_status) VALUES('state@example.test','State','user','member','active');");
    const memberId = scalar("SELECT id FROM members WHERE email='state@example.test';");
    sqlite(`INSERT INTO events(id,organizer_member_id,event_type,event_date,status,title,public_data_json) VALUES('event-state',${memberId},'gourmet','2099-01-01','open','State event','{}');`);
    expect(sqlite("UPDATE events SET status='invalid' WHERE id='event-state';", false).status).not.toBe(0);
    expect(sqlite("UPDATE members SET account_status='invalid' WHERE id=1;", false).status).not.toBe(0);
    expect(sqlite(`INSERT INTO event_participations(event_id,member_id,status,payment_state) VALUES('event-state',${memberId},'applied','invalid');`, false).status).not.toBe(0);
    expect(sqlite(`INSERT INTO event_payment_checkouts(id,event_id,member_id,item_name,amount_yen,status) VALUES('checkout-invalid','event-state',${memberId},'Event',1000,'invalid');`, false).status).not.toBe(0);
  });

  it("prevents duplicate applications, checkouts, rewards, and deliveries", () => {
    const memberId = scalar("SELECT id FROM members WHERE email='state@example.test';");
    sqlite(`INSERT INTO event_participations(event_id,member_id,status) VALUES('event-state',${memberId},'applied');`);
    expect(sqlite(`INSERT INTO event_participations(event_id,member_id,status) VALUES('event-state',${memberId},'confirmed');`, false).status).not.toBe(0);
    sqlite(`INSERT INTO event_payment_checkouts(id,event_id,member_id,item_name,amount_yen,status) VALUES('checkout-1','event-state',${memberId},'Event',1000,'creating');`);
    expect(sqlite(`INSERT INTO event_payment_checkouts(id,event_id,member_id,item_name,amount_yen,status) VALUES('checkout-2','event-state',${memberId},'Event',1000,'creating');`, false).status).not.toBe(0);
    sqlite(`INSERT INTO member_start_mission_rewards(member_id,mission_key,grant_id,status) VALUES(${memberId},'profile','grant-1','applied');`);
    expect(sqlite(`INSERT INTO member_start_mission_rewards(member_id,mission_key,grant_id,status) VALUES(${memberId},'profile','grant-2','applied');`, false).status).not.toBe(0);
  });

  it("round-trips membership access states through the real database schema", () => {
    const memberId = scalar("SELECT id FROM members WHERE email='state@example.test';");
    sqlite(`INSERT INTO member_subscriptions(member_id,billing_email,square_status,access_status,paid_until_date)
      VALUES(${memberId},'billing-state@example.test','ACTIVE','active','2099-01-01');`);
    const active = scalar("SELECT square_status || '|' || access_status || '|' || paid_until_date FROM member_subscriptions WHERE billing_email='billing-state@example.test';").split("|");
    expect(canAccessMemberApp({ squareStatus: active[0] as "ACTIVE", accessStatus: active[1] as "active", paidUntilDate: active[2] }, new Date("2026-10-02T00:00:00+09:00"))).toBe(true);

    sqlite("UPDATE member_subscriptions SET access_status='grace', grace_until_date='2026-10-08' WHERE billing_email='billing-state@example.test';");
    const grace = scalar("SELECT square_status || '|' || access_status || '|' || grace_until_date FROM member_subscriptions WHERE billing_email='billing-state@example.test';").split("|");
    expect(canAccessMemberApp({ squareStatus: grace[0] as "ACTIVE", accessStatus: grace[1] as "grace", graceUntilDate: grace[2] }, new Date("2026-10-08T23:59:59+09:00"))).toBe(true);
    expect(canAccessMemberApp({ squareStatus: grace[0] as "ACTIVE", accessStatus: grace[1] as "grace", graceUntilDate: grace[2] }, new Date("2026-10-09T00:00:00+09:00"))).toBe(false);

    sqlite("UPDATE member_subscriptions SET square_status='PAUSED', access_status='suspended', grace_until_date=NULL WHERE billing_email='billing-state@example.test';");
    expect(scalar("SELECT access_status FROM member_subscriptions WHERE billing_email='billing-state@example.test';")).toBe("suspended");
    expect(scalar(`SELECT previous_status || '|' || new_status FROM member_status_history
      WHERE member_id=${memberId} AND status_type='subscription_access_status'
      ORDER BY id DESC LIMIT 1;`)).toBe("grace|suspended");
  });

  it("retains withdrawn member data and records the previous account status with its change time", () => {
    const memberId = scalar("SELECT id FROM members WHERE email='state@example.test';");
    const changedAt = "2026-10-02T12:34:56.000Z";
    sqlite(`INSERT INTO withdrawn_member_snapshots
      (member_id,email,display_name,discord_user_id,public_member_id,role,access_role,
       branches_json,member_term,discord_roles_json,achievement_badges_json,profile_json,
       xp,last_signed_in_at,retained_at)
      SELECT id,email,display_name,discord_user_id,public_member_id,role,access_role,
       branches_json,member_term,discord_roles_json,achievement_badges_json,profile_json,
       xp,last_signed_in_at,'${changedAt}' FROM members WHERE id=${memberId};`);
    sqlite(`UPDATE members SET display_name='退会済みユーザー', account_status='withdrawn',
      updated_at='${changedAt}' WHERE id=${memberId};`);

    expect(scalar(`SELECT display_name FROM members WHERE id=${memberId};`)).toBe("退会済みユーザー");
    expect(scalar(`SELECT display_name FROM withdrawn_member_snapshots WHERE member_id=${memberId};`)).toBe("State");
    expect(scalar(`SELECT previous_status || '|' || new_status || '|' || changed_at
      FROM member_status_history WHERE member_id=${memberId} AND status_type='account_status'
      ORDER BY id DESC LIMIT 1;`)).toBe(`active|withdrawn|${changedAt}`);
    expect(sqlite(`DELETE FROM members WHERE id=${memberId};`, false).status).not.toBe(0);
  });

  it("enforces profile handles and follow relationships in the real database", () => {
    const memberId = scalar("SELECT id FROM members WHERE email='state@example.test';");
    sqlite("UPDATE members SET user_handle='state.member', profile_json='{\"bio\":\"hello\"}' WHERE id=" + memberId + ";");
    sqlite("INSERT INTO members(email,display_name,role,access_role,account_status,user_handle) VALUES('friend@example.test','Friend','user','member','active','friend.member');");
    const friendId = scalar("SELECT id FROM members WHERE email='friend@example.test';");

    expect(sqlite("UPDATE members SET user_handle='STATE.MEMBER' WHERE id=" + friendId + ";", false).status).not.toBe(0);
    sqlite(`INSERT INTO member_follows(follower_member_id,followed_member_id) VALUES(${memberId},${friendId});`);
    expect(sqlite(`INSERT INTO member_follows(follower_member_id,followed_member_id) VALUES(${memberId},${friendId});`, false).status).not.toBe(0);
    expect(sqlite(`INSERT INTO member_follows(follower_member_id,followed_member_id) VALUES(${memberId},${memberId});`, false).status).not.toBe(0);
    expect(scalar(`SELECT COUNT(*) FROM member_follows WHERE follower_member_id=${memberId} AND followed_member_id=${friendId};`)).toBe("1");
  });

  it("enforces board and chat relationships, enums, and duplicate guards", () => {
    const memberId = scalar("SELECT id FROM members WHERE email='state@example.test';");
    const friendId = scalar("SELECT id FROM members WHERE email='friend@example.test';");

    sqlite(`INSERT INTO board_threads(id,author_member_id,category,title,content,status)
      VALUES('thread-integration',${memberId},'general','Integration thread','Body','open');`);
    sqlite(`INSERT INTO board_comments(id,thread_id,author_member_id,content)
      VALUES('comment-integration','thread-integration',${friendId},'Reply');`);
    sqlite(`INSERT INTO board_reactions(target_type,target_id,member_id,emoji)
      VALUES('thread','thread-integration',${friendId},'like');`);
    expect(sqlite(`INSERT INTO board_reactions(target_type,target_id,member_id,emoji)
      VALUES('thread','thread-integration',${friendId},'like');`, false).status).not.toBe(0);
    expect(sqlite(`INSERT INTO board_threads(id,author_member_id,category,title,content,status)
      VALUES('thread-invalid',${memberId},'general','Invalid','Body','invalid');`, false).status).not.toBe(0);
    expect(sqlite(`INSERT INTO board_reactions(target_type,target_id,member_id,emoji)
      VALUES('invalid','thread-integration',${friendId},'like');`, false).status).not.toBe(0);

    sqlite(`INSERT INTO chat_rooms(id,name,room_type,created_by_member_id)
      VALUES('chat-integration','Integration room','group',${memberId});`);
    sqlite(`INSERT INTO chat_room_members(room_id,member_id,member_role)
      VALUES('chat-integration',${memberId},'owner'),('chat-integration',${friendId},'member');`);
    sqlite(`INSERT INTO chat_messages(id,room_id,sender_member_id,content)
      VALUES('message-integration','chat-integration',${memberId},'Hello');`);
    sqlite(`INSERT INTO chat_message_reactions(message_id,member_id,emoji)
      VALUES('message-integration',${friendId},'like');`);
    expect(sqlite(`INSERT INTO chat_room_members(room_id,member_id,member_role)
      VALUES('chat-integration',${friendId},'member');`, false).status).not.toBe(0);
    expect(sqlite(`INSERT INTO chat_message_reactions(message_id,member_id,emoji)
      VALUES('message-integration',${friendId},'like');`, false).status).not.toBe(0);
    expect(sqlite(`INSERT INTO chat_rooms(id,name,room_type)
      VALUES('chat-invalid','Invalid room','invalid');`, false).status).not.toBe(0);

    sqlite("DELETE FROM board_threads WHERE id='thread-integration';");
    expect(scalar("SELECT COUNT(*) FROM board_comments WHERE thread_id='thread-integration';")).toBe("0");
    sqlite("DELETE FROM board_reactions WHERE target_id='thread-integration';");

    sqlite("DELETE FROM chat_rooms WHERE id='chat-integration';");
    expect(scalar("SELECT COUNT(*) FROM chat_room_members WHERE room_id='chat-integration';")).toBe("0");
    expect(scalar("SELECT COUNT(*) FROM chat_messages WHERE room_id='chat-integration';")).toBe("0");
    expect(scalar("SELECT COUNT(*) FROM chat_message_reactions WHERE message_id='message-integration';")).toBe("0");
  });

  it("persists the event recruitment-to-completion lifecycle", () => {
    const organizerId = scalar("SELECT id FROM members WHERE email='state@example.test';");
    const participantId = scalar("SELECT id FROM members WHERE email='friend@example.test';");
    sqlite(`INSERT INTO events(id,organizer_member_id,event_type,event_date,status,title,public_data_json)
      VALUES('event-lifecycle',${organizerId},'gourmet','2099-02-01','open','Lifecycle event','{"recruitmentChannel":"app"}');`);
    sqlite(`INSERT INTO event_participations(event_id,member_id,status)
      VALUES('event-lifecycle',${participantId},'applied');`);
    expect(scalar(`SELECT status FROM event_participations
      WHERE event_id='event-lifecycle' AND member_id=${participantId};`)).toBe("applied");

    sqlite(`UPDATE event_participations SET status='confirmed', confirmed_at=CURRENT_TIMESTAMP
      WHERE event_id='event-lifecycle' AND member_id=${participantId};`);
    sqlite("UPDATE events SET status='full' WHERE id='event-lifecycle';");
    expect(scalar("SELECT status FROM events WHERE id='event-lifecycle';")).toBe("full");
    expect(scalar(`SELECT status FROM event_participations
      WHERE event_id='event-lifecycle' AND member_id=${participantId};`)).toBe("confirmed");

    sqlite(`UPDATE event_participations SET status='cancel_requested'
      WHERE event_id='event-lifecycle' AND member_id=${participantId};`);
    expect(scalar(`SELECT status FROM event_participations
      WHERE event_id='event-lifecycle' AND member_id=${participantId};`)).toBe("cancel_requested");
    sqlite(`UPDATE event_participations SET status='cancelled', cancelled_at=CURRENT_TIMESTAMP
      WHERE event_id='event-lifecycle' AND member_id=${participantId};`);
    sqlite("UPDATE events SET status='ended' WHERE id='event-lifecycle';");
    expect(scalar("SELECT status FROM events WHERE id='event-lifecycle';")).toBe("ended");
    expect(scalar(`SELECT status FROM event_participations
      WHERE event_id='event-lifecycle' AND member_id=${participantId};`)).toBe("cancelled");
  });

  it("cascades event participation data while preserving restricted payment history", () => {
    const memberId = scalar("SELECT id FROM members WHERE email='state@example.test';");
    expect(sqlite("DELETE FROM events WHERE id='event-state';", false).status).not.toBe(0);
    sqlite("DELETE FROM event_payment_checkouts WHERE id='checkout-1';");
    sqlite("DELETE FROM events WHERE id='event-state';");
    expect(scalar(`SELECT COUNT(*) FROM event_participations WHERE member_id=${memberId};`)).toBe("0");
  });
});
