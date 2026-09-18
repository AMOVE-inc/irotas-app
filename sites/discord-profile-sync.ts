import type { D1Database } from "./platform-types";

// Apply a previously imported Discord snapshot after a verified membership
// import links its Discord ID. App-authored biography and avatar take priority.
export function syncStoredDiscordProfiles(
  db: D1Database,
  now: string,
  discordIds: string[],
  options: { overwriteDisplayName?: boolean } = {},
) {
  if (!discordIds.length) throw new Error("discord_ids_required");
  const placeholders = discordIds.map(() => "?").join(", ");
  return db.prepare(`UPDATE members SET
    display_name = CASE WHEN ? = 1 OR display_name = '' OR display_name = substr(email, 1, instr(email, '@') - 1)
      THEN (SELECT display_name FROM discord_profile_snapshots p WHERE p.discord_user_id = members.discord_user_id)
      ELSE display_name END,
    member_term = COALESCE((SELECT member_term FROM discord_profile_snapshots p WHERE p.discord_user_id = members.discord_user_id), member_term),
    member_rank = COALESCE((SELECT member_rank FROM discord_profile_snapshots p WHERE p.discord_user_id = members.discord_user_id), member_rank),
    discord_roles_json = COALESCE((SELECT discord_roles_json FROM discord_profile_snapshots p WHERE p.discord_user_id = members.discord_user_id), discord_roles_json),
    discord_joined_at = COALESCE((SELECT discord_joined_at FROM discord_profile_snapshots p WHERE p.discord_user_id = members.discord_user_id), discord_joined_at),
    profile_json = json_set(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END,
      '$.bio', CASE WHEN COALESCE(json_extract(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END, '$.bio'), '') = ''
        THEN COALESCE((SELECT CASE WHEN has_profile_bio = 1 THEN bio ELSE '' END FROM discord_profile_snapshots p WHERE p.discord_user_id = members.discord_user_id), '')
        ELSE json_extract(profile_json, '$.bio') END,
      '$.avatarUrl', CASE WHEN COALESCE(json_extract(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END, '$.avatarUrl'), '') = ''
        THEN COALESCE((SELECT avatar_url FROM discord_profile_snapshots p WHERE p.discord_user_id = members.discord_user_id), '')
        ELSE json_extract(profile_json, '$.avatarUrl') END),
    updated_at = ?
    WHERE discord_user_id IN (${placeholders}) AND EXISTS (
      SELECT 1 FROM discord_profile_snapshots p WHERE p.discord_user_id = members.discord_user_id
    )`).bind(options.overwriteDisplayName ? 1 : 0, now, ...discordIds);
}
