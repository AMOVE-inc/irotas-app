-- Prefer the explicit historical ID, then the imported Discord role. This keeps
-- the leader assignment tied to a verifiable Discord authority rather than a
-- generic club-member role.
UPDATE clubs
SET leader_member_id = COALESCE(
      (SELECT id FROM members WHERE discord_user_id = '1530052808651309169' LIMIT 1),
      (SELECT id FROM members
       WHERE json_valid(discord_roles_json)
         AND EXISTS (SELECT 1 FROM json_each(discord_roles_json) WHERE CAST(value AS TEXT) LIKE '%肉部長%')
       ORDER BY updated_at DESC LIMIT 1),
      leader_member_id
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'club-meat';

INSERT OR REPLACE INTO discord_access_role_assignments
  (discord_user_id, discord_username, display_name, intended_access_role, linked_member_id, status, created_at, updated_at)
SELECT '1530052808651309169', NULL, 'はぎーちゃん（肉部長）', 'club_leader', c.leader_member_id, 'linked', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM clubs c
WHERE c.id = 'club-meat' AND c.leader_member_id IS NOT NULL;

INSERT INTO club_memberships (club_id, member_id, status, source, applied_at, approved_at, updated_at)
SELECT id, leader_member_id, 'approved', 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM clubs
WHERE id = 'club-meat' AND leader_member_id IS NOT NULL
ON CONFLICT(club_id, member_id) DO UPDATE SET
  status = 'approved', source = 'admin', approved_at = COALESCE(club_memberships.approved_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP;

UPDATE members
SET access_role = CASE WHEN role = 'user' AND access_role = 'member' THEN 'club_leader' ELSE access_role END,
    updated_at = CURRENT_TIMESTAMP
WHERE id = (SELECT leader_member_id FROM clubs WHERE id = 'club-meat');

UPDATE system_metadata SET value = '29', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
