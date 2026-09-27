import type { D1Database } from "./platform-types";

type Candidate = {
  notification_id: string; token: string; type: string; title: string; body: string;
  target_path: string | null; chat_room_id: string | null; event_id: string | null;
  preferences_json: string;
};

const preferenceFor = (candidate: Candidate) => {
  const type = candidate.type;
  if (candidate.notification_id.startsWith("chat-mention:")) return "mention";
  if (type === "chat") return "chat_message";
  if (type === "comment") return "board_reply";
  if (type.includes("rank")) return "rank_up";
  if (type.includes("point") || type === "coupon") return "points";
  if (type.includes("leader")) return "club_leader";
  if (type.includes("application")) return "club_join";
  if (type.includes("club") || type.includes("board_approved")) return "board_approved";
  if (type.includes("reminder") || type.includes("deadline")) return "event_reminder";
  if (type.includes("event")) return "event_approved";
  return "new_event";
};

function enabled(candidate: Candidate) {
  try {
    const prefs = JSON.parse(candidate.preferences_json || "{}") as Record<string, unknown>;
    return prefs[preferenceFor(candidate)] !== false;
  } catch { return true; }
}

export async function dispatchPendingPushNotifications(db: D1Database) {
  const candidates = await db.prepare(`SELECT n.id AS notification_id, t.token, n.type, n.title, n.body,
      n.target_path, n.chat_room_id, n.event_id, t.preferences_json
    FROM in_app_notifications n JOIN member_push_tokens t ON t.member_id = n.target_member_id AND t.disabled_at IS NULL
    LEFT JOIN push_notification_deliveries d ON d.notification_id = n.id AND d.token = t.token
    WHERE d.notification_id IS NULL AND n.created_at >= t.created_at
      AND julianday(n.created_at) >= julianday('now','-7 days')
    ORDER BY n.created_at LIMIT 100`).all<Candidate>();
  const allRows = candidates.results ?? [];
  if (!allRows.length) return 0;
  const now = new Date().toISOString();
  const suppressed = allRows.filter((row) => !enabled(row));
  const rows = allRows.filter(enabled);
  if (suppressed.length) await db.batch(suppressed.map((row) => db.prepare(`INSERT OR IGNORE INTO push_notification_deliveries
    (notification_id,token,status,error_code,created_at,completed_at) VALUES (?,?,'sent','preference_disabled',?,?)`)
    .bind(row.notification_id, row.token, now, now)));
  if (!rows.length) return 0;
  await db.batch(rows.map((row) => db.prepare(`INSERT OR IGNORE INTO push_notification_deliveries
    (notification_id,token,status,created_at) VALUES (?,?,'pending',?)`).bind(row.notification_id, row.token, now)));
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(rows.map((row) => ({
      to: row.token, sound: "default", title: row.title, body: row.body,
      data: { type: row.type, targetPath: row.target_path, chatRoomId: row.chat_room_id, eventId: row.event_id },
    }))),
  });
  if (!response.ok) {
    await db.batch(rows.map((row) => db.prepare(`DELETE FROM push_notification_deliveries
      WHERE notification_id=? AND token=? AND status='pending'`).bind(row.notification_id, row.token)));
    return 0;
  }
  const result = await response.json() as { data?: { status?: string; details?: { error?: string } }[] };
  const tickets = Array.isArray(result.data) ? result.data : [];
  for (let start = 0; start < rows.length; start += 50) {
    await db.batch(rows.slice(start, start + 50).map((row, offset) => {
      const ticket = tickets[start + offset];
      const ok = ticket?.status === "ok";
      const error = ticket?.details?.error ?? (ok ? null : "unknown");
      if (!ok && error !== "DeviceNotRegistered") return db.prepare(`DELETE FROM push_notification_deliveries
        WHERE notification_id=? AND token=? AND status='pending'`).bind(row.notification_id, row.token);
      return db.prepare(`UPDATE push_notification_deliveries SET status=?,error_code=?,completed_at=?
        WHERE notification_id=? AND token=? AND status='pending'`).bind(ok ? "sent" : "failed", error, now, row.notification_id, row.token);
    }));
  }
  const invalidTokens = rows.filter((row, index) => tickets[index]?.details?.error === "DeviceNotRegistered").map((row) => row.token);
  if (invalidTokens.length) await db.batch(invalidTokens.map((token) => db.prepare("UPDATE member_push_tokens SET disabled_at=?,updated_at=? WHERE token=?").bind(now, now, token)));
  return rows.length;
}
