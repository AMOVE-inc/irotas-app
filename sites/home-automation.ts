import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const HOME_ACTIVITIES = "/api/home/activities";
const DAY = 86_400_000;

type EventRow = {
  id: string;
  organizer_member_id: number;
  event_type: string;
  event_date: string;
  status: string;
  title: string;
  public_data_json: string;
};

type ReminderKind =
  | "seven_days" | "two_days"
  | "organizer_three_days" | "organizer_two_days" | "organizer_one_day" | "organizer_same_day"
  | "favorite_three_days" | "favorite_one_day";

type Reminder = {
  event: EventRow;
  targetMemberId: number;
  kind: ReminderKind;
  scheduledAt: Date;
  chatRoomId?: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
}

function eventData(row: EventRow) {
  try { return JSON.parse(row.public_data_json) as Record<string, unknown>; } catch { return {}; }
}

function tokyoDateTime(date: string, time = "09:00") {
  const result = new Date(`${date}T${time}:00+09:00`);
  return Number.isNaN(result.getTime()) ? null : result;
}

function dueRecently(scheduledAt: Date, now: Date) {
  const delay = now.getTime() - scheduledAt.getTime();
  return delay >= 0 && delay < DAY;
}

function label(kind: ReminderKind) {
  if (kind === "seven_days") return "1週間前";
  if (kind === "two_days" || kind === "organizer_two_days") return "2日前";
  if (kind === "organizer_three_days" || kind === "favorite_three_days") return "3日前";
  if (kind === "organizer_same_day") return "当日";
  return "前日";
}

async function pendingReminders(db: D1Database, now: Date) {
  const rows = await db.prepare("SELECT id, organizer_member_id, event_type, event_date, status, title, public_data_json FROM events WHERE status IN ('open','full')").all<EventRow>();
  const reminders: Reminder[] = [];
  for (const event of rows.results ?? []) {
    const data = eventData(event);
    const start = tokyoDateTime(event.event_date, typeof data.time === "string" ? data.time : "00:00");
    const deadline = typeof data.applicationDeadline === "string" ? tokyoDateTime(data.applicationDeadline) : null;
    const finalized = typeof data.participantsFinalizedAt === "string" && data.participantsFinalizedAt.length > 0;
    if (deadline && !finalized) {
      const offsets: Array<[ReminderKind, number]> = [["organizer_three_days", 3], ["organizer_two_days", 2], ["organizer_one_day", 1], ["organizer_same_day", 0]];
      for (const [kind, days] of offsets) {
        const scheduledAt = new Date(deadline.getTime() - days * DAY);
        if (dueRecently(scheduledAt, now)) reminders.push({ event, targetMemberId: event.organizer_member_id, kind, scheduledAt });
      }
      const favorites = await db.prepare("SELECT member_id FROM event_favorites WHERE event_id = ?").bind(event.id).all<{ member_id: number }>();
      for (const favorite of favorites.results ?? []) {
        for (const [kind, days] of [["favorite_three_days", 3], ["favorite_one_day", 1]] as Array<[ReminderKind, number]>) {
          const scheduledAt = new Date(deadline.getTime() - days * DAY);
          if (dueRecently(scheduledAt, now)) reminders.push({ event, targetMemberId: favorite.member_id, kind, scheduledAt });
        }
      }
    }
    if (start) {
      const dataChatId = typeof data.chatId === "string" && data.chatId ? data.chatId : `event_chat_${event.id}`;
      const participants = await db.prepare("SELECT member_id FROM event_participations WHERE event_id = ? AND status IN ('confirmed','cancel_requested')").bind(event.id).all<{ member_id: number }>();
      for (const participant of participants.results ?? []) {
        for (const [kind, days] of [["seven_days", 7], ["two_days", 2]] as Array<[ReminderKind, number]>) {
          const scheduledAt = new Date(start.getTime() - days * DAY);
          if (dueRecently(scheduledAt, now)) reminders.push({ event, targetMemberId: participant.member_id, kind, scheduledAt, chatRoomId: dataChatId });
        }
      }
    }
  }
  return reminders;
}

async function deliverReminder(db: D1Database, reminder: Reminder, now: Date) {
  const id = `${reminder.event.id}:${reminder.targetMemberId}:${reminder.kind}`;
  await db.prepare(`INSERT OR IGNORE INTO event_automation_deliveries
    (id, event_id, target_member_id, kind, scheduled_at, status) VALUES (?, ?, ?, ?, ?, 'pending')`)
    .bind(id, reminder.event.id, reminder.targetMemberId, reminder.kind, reminder.scheduledAt.toISOString()).run();
  const delivery = await db.prepare("SELECT status FROM event_automation_deliveries WHERE id = ?").bind(id).first<{ status: string }>();
  if (delivery?.status === "delivered") return false;
  const eventLabel = label(reminder.kind);
  const notificationId = `event-reminder:${id}`;
  if (reminder.kind.startsWith("organizer_")) {
    await db.prepare(`INSERT OR IGNORE INTO in_app_notifications
      (id, target_member_id, type, title, body, event_id, created_at) VALUES (?, ?, 'event_deadline', ?, ?, ?, ?)`)
      .bind(notificationId, reminder.targetMemberId, "参加者を確定してください", `「${reminder.event.title}」の参加者決定予定日の${eventLabel}です。申込者を確認してください。`, reminder.event.id, now.toISOString()).run();
  } else if (reminder.kind.startsWith("favorite_")) {
    await db.prepare(`INSERT OR IGNORE INTO in_app_notifications
      (id, target_member_id, type, title, body, event_id, created_at) VALUES (?, ?, 'event_reminder', ?, ?, ?, ?)`)
      .bind(notificationId, reminder.targetMemberId, "お気に入りイベントの募集期限が近づいています", `「${reminder.event.title}」の募集期限は${eventLabel}です。申込み忘れがないかご確認ください。`, reminder.event.id, now.toISOString()).run();
  } else if (reminder.chatRoomId) {
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO chat_rooms (id, name, room_type, source_id, created_by_member_id, created_at, updated_at)
        VALUES (?, ?, 'event', ?, ?, ?, ?)`).bind(reminder.chatRoomId, reminder.event.title, reminder.event.id, reminder.event.organizer_member_id, now.toISOString(), now.toISOString()),
      db.prepare(`INSERT INTO chat_room_members (room_id, member_id, member_role, joined_at, left_at) VALUES (?, ?, 'member', ?, NULL)
        ON CONFLICT(room_id, member_id) DO UPDATE SET left_at = NULL`)
        .bind(reminder.chatRoomId, reminder.targetMemberId, now.toISOString()),
      db.prepare(`INSERT OR IGNORE INTO chat_messages (id, room_id, sender_member_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(`event-reminder-message:${reminder.event.id}:${reminder.kind}`, reminder.chatRoomId, reminder.event.organizer_member_id, `【自動リマインド】「${reminder.event.title}」の開催${eventLabel}です。集合時間や連絡事項をご確認ください。`, now.toISOString(), now.toISOString()),
      db.prepare(`INSERT OR IGNORE INTO in_app_notifications
        (id, target_member_id, type, title, body, event_id, chat_room_id, created_at) VALUES (?, ?, 'event_reminder', ?, ?, ?, ?, ?)`)
        .bind(notificationId, reminder.targetMemberId, `${reminder.event.title}は${eventLabel}です`, "参加者チャットをご確認ください。", reminder.event.id, reminder.chatRoomId, now.toISOString()),
    ]);
  }
  await db.prepare("UPDATE event_automation_deliveries SET status = 'delivered', delivered_at = ? WHERE id = ?").bind(now.toISOString(), id).run();
  return true;
}

export async function runEventAutomation(db: D1Database, now = new Date()) {
  let delivered = 0;
  for (const reminder of await pendingReminders(db, now)) if (await deliverReminder(db, reminder, now)) delivered += 1;
  delivered += await finalizeExpiredBoardPolls(db, now);
  return delivered;
}

type PollOwnerRow = { owner_type: "thread" | "comment"; owner_id: string; author_member_id: number; data_json: string };

function pollFromData(dataJson: string) {
  try {
    const data = JSON.parse(dataJson) as Record<string, unknown>;
    const poll = data.poll as { question?: unknown; deadline?: unknown; options?: unknown } | undefined;
    if (!poll || typeof poll.question !== "string" || typeof poll.deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(poll.deadline) || !Array.isArray(poll.options)) return null;
    const options = poll.options.flatMap((item) => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" && typeof (item as { text?: unknown }).text === "string"
      ? [{ id: (item as { id: string }).id, text: (item as { text: string }).text }]
      : []);
    return options.length >= 2 ? { question: poll.question, deadline: poll.deadline, options } : null;
  } catch { return null; }
}

async function finalizeExpiredBoardPolls(db: D1Database, now: Date) {
  const owners = await db.prepare(`SELECT 'thread' AS owner_type, id AS owner_id, author_member_id, data_json FROM board_threads WHERE deleted_at IS NULL AND data_json LIKE '%"poll"%'
    UNION ALL
    SELECT 'comment' AS owner_type, id AS owner_id, author_member_id, data_json FROM board_comments WHERE deleted_at IS NULL AND data_json LIKE '%"poll"%'`).all<PollOwnerRow>();
  let finalized = 0;
  for (const owner of owners.results ?? []) {
    const poll = pollFromData(owner.data_json);
    if (!poll || now.getTime() <= new Date(`${poll.deadline}T23:59:59+09:00`).getTime()) continue;
    const key = `${owner.owner_type}:${owner.owner_id}`;
    await db.prepare(`INSERT OR IGNORE INTO board_poll_finalizations (owner_type, owner_id, status) VALUES (?, ?, 'pending')`).bind(owner.owner_type, owner.owner_id).run();
    const state = await db.prepare("SELECT status FROM board_poll_finalizations WHERE owner_type = ? AND owner_id = ?").bind(owner.owner_type, owner.owner_id).first<{ status: string }>();
    if (state?.status === "delivered") continue;
    const votes = await db.prepare(`SELECT option_id, member_id FROM board_poll_votes WHERE owner_type = ? AND owner_id = ?`).bind(owner.owner_type, owner.owner_id).all<{ option_id: string; member_id: number }>();
    const counts = Object.fromEntries(poll.options.map((option) => [option.id, (votes.results ?? []).filter((vote) => vote.option_id === option.id).length]));
    const maximum = Math.max(0, ...Object.values(counts));
    const winners = maximum === 0 ? [] : poll.options.filter((option) => counts[option.id] === maximum).map((option) => option.text);
    const result = maximum === 0 ? "投票はありませんでした" : `${winners.join("・")}（${maximum}票）`;
    const targets = [...new Set([owner.author_member_id, ...(votes.results ?? []).map((vote) => vote.member_id)])];
    for (const target of targets) await db.prepare(`INSERT OR IGNORE INTO in_app_notifications
      (id, target_member_id, type, title, body, created_at) VALUES (?, ?, 'poll_result', '投票結果が確定しました', ?, ?)`).bind(`poll-result:${key}:${target}`, target, `${poll.question}：${result}`, now.toISOString()).run();
    await db.prepare("UPDATE board_poll_finalizations SET status = 'delivered', result_json = ?, finalized_at = ? WHERE owner_type = ? AND owner_id = ?")
      .bind(JSON.stringify({ question: poll.question, result, counts }), now.toISOString(), owner.owner_type, owner.owner_id).run();
    finalized += 1;
  }
  return finalized;
}

async function homeActivities(db: D1Database) {
  const [events, threads, comments, announcements] = await Promise.all([
    db.prepare(`SELECT id, event_type, title, created_at FROM events WHERE status != 'cancelled' ORDER BY created_at DESC LIMIT 50`).all<Record<string, unknown>>(),
    db.prepare(`SELECT t.id, t.category, t.title, t.content, t.created_at, m.display_name
      FROM board_threads t JOIN members m ON m.id = t.author_member_id
      WHERE t.deleted_at IS NULL AND t.category IN ('gourmet-contest','introduction','meal-report','gourmet-advice','free-chat')
      ORDER BY t.created_at DESC LIMIT 80`).all<Record<string, unknown>>(),
    db.prepare(`SELECT c.id, c.content, c.created_at, t.id AS thread_id, t.title
      FROM board_comments c JOIN board_threads t ON t.id = c.thread_id
      WHERE c.deleted_at IS NULL AND t.deleted_at IS NULL AND t.category = 'gourmet-contest'
      ORDER BY c.created_at DESC LIMIT 50`).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, content, created_at FROM chat_messages
      WHERE room_id = 'board-announcement' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 30`).all<Record<string, unknown>>(),
  ]);
  const kindByCategory: Record<string, string> = { "gourmet-contest": "contest_thread", introduction: "introduction", "meal-report": "meal_report", "gourmet-advice": "gourmet_advice", "free-chat": "free_chat" };
  return [
    ...(events.results ?? []).map((row) => ({ id: `event:${row.id}`, kind: "event", title: row.title, description: row.event_type === "official" ? "新しい公式イベントが公開されました" : row.event_type === "club" ? "新しい部活動イベントが公開されました" : "新しいグルメ会が公開されました", createdAt: row.created_at, route: "/event-detail", params: { id: String(row.id) } })),
    ...(threads.results ?? []).map((row) => ({ id: `thread:${row.id}`, kind: kindByCategory[String(row.category)], title: row.category === "introduction" ? `${row.display_name}さんが自己紹介を投稿しました` : row.title, description: String(row.content ?? "").slice(0, 180), createdAt: row.created_at, route: "/board", params: { category: String(row.category), view: "threads", thread: String(row.id) } })),
    ...(comments.results ?? []).map((row) => ({ id: `comment:${row.id}`, kind: "contest_comment", title: `${row.title}にコメントが追加されました`, description: String(row.content ?? "").slice(0, 180), createdAt: row.created_at, route: "/board", params: { category: "gourmet-contest", view: "threads", thread: String(row.thread_id) } })),
    ...(announcements.results ?? []).map((row) => ({ id: `announcement:${row.id}`, kind: "announcement", title: "運営アナウンスが更新されました", description: String(row.content ?? "").slice(0, 180), createdAt: row.created_at, route: "/chat", params: { id: "board-announcement" } })),
  ].sort((a, b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt))).slice(0, 200);
}

export async function handleHomeAutomationRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== HOME_ACTIVITIES) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  await runEventAutomation(env.DB);
  return json({ activities: await homeActivities(env.DB) });
}
