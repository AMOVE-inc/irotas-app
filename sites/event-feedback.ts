import { authenticatedRequestMember } from "./auth";
import { EVENT_XP, awardEventReward } from "./event-rewards";
import type { SitesEnv } from "./platform-types";

const FEEDBACK_PATH = /^\/api\/events\/([^/]+)\/feedback$/;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const rating = (value: unknown) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : null;
const tags = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 20) : [];

export async function handleEventFeedbackRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const match = FEEDBACK_PATH.exec(new URL(request.url).pathname);
  if (!match) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const member = await authenticatedRequestMember(request, env);
  if (!member) return json({ error: "ログインが必要です" }, 401);
  const eventId = decodeURIComponent(match[1]);
  const participant = await env.DB.prepare("SELECT 1 AS allowed FROM event_attendance_confirmations WHERE event_id = ? AND member_id = ? AND status = 'attended' LIMIT 1").bind(eventId, member.id).first<{ allowed: number }>();
  if (!participant) return json({ error: "参加したイベントのみ回答できます" }, 403);
  const event = await env.DB.prepare("SELECT event_date, public_data_json FROM events WHERE id = ? LIMIT 1").bind(eventId).first<{ event_date: string; public_data_json: string }>();
  let eventTime = "00:00";
  try { const data = JSON.parse(event?.public_data_json ?? "{}") as Record<string, unknown>; if (typeof data.time === "string") eventTime = data.time; } catch {}
  const closesAt = new Date(`${event?.event_date ?? "1970-01-01"}T${eventTime}:00+09:00`).getTime() + 72 * 60 * 60_000;
  if (Date.now() > closesAt) return json({ error: "アンケート回答期限（開催後72時間）を過ぎています" }, 409);

  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM event_feedback_responses WHERE event_id = ? AND member_id = ? LIMIT 1").bind(eventId, member.id).first<Record<string, unknown>>();
    return json({ feedback: row });
  }
  if (request.method !== "PUT") return json({ error: "method_not_allowed" }, 405);
  const input = await request.json() as Record<string, unknown>;
  const overall = rating(input.overallRating), food = rating(input.foodRating), venue = rating(input.venueRating), community = rating(input.communityRating);
  if (!overall || !food || !venue || !community) return json({ error: "評価を1〜5で入力してください" }, 400);
  const comment = typeof input.comment === "string" ? input.comment.trim().slice(0, 2000) : "";
  const existing = await env.DB.prepare("SELECT id FROM event_feedback_responses WHERE event_id = ? AND member_id = ? LIMIT 1").bind(eventId, member.id).first<{ id: string }>();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO event_feedback_responses
    (id,event_id,member_id,overall_rating,food_rating,venue_rating,community_rating,would_attend_again,good_tags_json,improvement_tags_json,comment,submitted_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(event_id,member_id) DO UPDATE SET overall_rating=excluded.overall_rating,food_rating=excluded.food_rating,venue_rating=excluded.venue_rating,community_rating=excluded.community_rating,would_attend_again=excluded.would_attend_again,good_tags_json=excluded.good_tags_json,improvement_tags_json=excluded.improvement_tags_json,comment=excluded.comment,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), eventId, member.id, overall, food, venue, community, input.wouldAttendAgain === false ? 0 : 1, JSON.stringify(tags(input.goodTags)), JSON.stringify(tags(input.improvementTags)), comment, now, now).run();
  if (!existing) await awardEventReward(env.DB, { eventId, memberId: member.id, action: "event_feedback", amount: EVENT_XP.feedback, now });
  return json({ success: true, submittedAt: now });
}
