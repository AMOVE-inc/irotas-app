import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const PATH = "/api/admin/non-member-id";
const OLD_ID = "IRO-TEST-001";
const FIRST_CHOICE = "IRO0001";
const SECOND_CHOICE = "IRO0000";
const NON_DISCORD_ID = "1119606639763390545";

type MemberIdRow = { id: number; display_name: string; public_member_id: string | null; discord_user_id: string | null };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });

/** Correct only Non's mistakenly assigned test ID; never repurpose another member's ID. */
export async function handleNonMemberIdRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== PATH) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const admin = await authenticatedRequestMember(request, env);
  if (!admin) return json({ error: "ログインが必要です" }, 401);
  if (admin.role !== "admin" && admin.access_role !== "admin") return json({ error: "管理者権限が必要です" }, 403);
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const target = await env.DB.prepare(`SELECT id, display_name, public_member_id, discord_user_id FROM members
    WHERE discord_user_id = ? OR (public_member_id IN (?, ?) AND display_name LIKE 'Non%') OR (public_member_id = ? AND display_name LIKE 'Non%')
    ORDER BY CASE WHEN discord_user_id = ? THEN 0 ELSE 1 END LIMIT 1`)
    .bind(NON_DISCORD_ID, FIRST_CHOICE, SECOND_CHOICE, OLD_ID, NON_DISCORD_ID).first<MemberIdRow>();
  if (!target || !/^Non(?:\s|【|$)/i.test(target.display_name)) return json({ error: "対象のNon代表アカウントを確認できません" }, 404);
  const occupied = await env.DB.prepare("SELECT id, public_member_id FROM members WHERE public_member_id IN (?, ?)")
    .bind(FIRST_CHOICE, SECOND_CHOICE).all<{ id: number; public_member_id: string }>();
  const taken = new Map((occupied.results ?? []).map((row) => [row.public_member_id, row.id]));
  const nextId = !taken.has(FIRST_CHOICE) || taken.get(FIRST_CHOICE) === target.id ? FIRST_CHOICE
    : !taken.has(SECOND_CHOICE) || taken.get(SECOND_CHOICE) === target.id ? SECOND_CHOICE : null;
  if (request.method === "GET") return json({ member: { name: target.display_name, currentId: target.public_member_id, nextId } });
  if (target.public_member_id === FIRST_CHOICE || target.public_member_id === SECOND_CHOICE)
    return json({ member: { name: target.display_name, currentId: target.public_member_id, nextId: target.public_member_id }, updated: false });
  if (target.public_member_id !== OLD_ID) return json({ error: "現在の会員IDが想定と異なるため変更しません" }, 409);
  if (!nextId) return json({ error: "IRO0001とIRO0000はどちらも使用中です" }, 409);

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE members SET public_member_id = ?, updated_at = ? WHERE id = ? AND public_member_id = ?")
      .bind(nextId, now, target.id, OLD_ID),
    env.DB.prepare("UPDATE events SET public_data_json = replace(public_data_json, ?, ?), updated_at = ? WHERE instr(public_data_json, ?) > 0")
      .bind(OLD_ID, nextId, now, OLD_ID),
    env.DB.prepare(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (?, 'admin.non_member_id_corrected', 'member', ?, ?, ?)`)
      .bind(String(admin.id), String(target.id), JSON.stringify({ from: OLD_ID, to: nextId }), now),
  ]);
  return json({ member: { name: target.display_name, currentId: nextId, nextId }, updated: true });
}
