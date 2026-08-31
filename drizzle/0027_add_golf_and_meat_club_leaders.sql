INSERT OR REPLACE INTO discord_access_role_assignments
  (discord_user_id, discord_username, display_name, intended_access_role, linked_member_id, status, created_at, updated_at)
SELECT '1507605842629890231', NULL, 'まりこ（ゴルフ部長）', 'club_leader', id, 'linked', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM members WHERE discord_user_id = '1507605842629890231'
UNION ALL
SELECT '1530052808651309169', NULL, 'はぎーちゃん（肉部長）', 'club_leader', id, 'linked', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM members WHERE discord_user_id = '1530052808651309169';

INSERT INTO clubs (id, name, description, icon, leader_member_id, status, created_at, updated_at)
VALUES
  ('club-golf', 'ゴルフ部', 'ゴルフを一緒に楽しむ部活です。', '⛳', (SELECT id FROM members WHERE discord_user_id = '1507605842629890231' LIMIT 1), 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('club-meat', '肉部', '肉料理と焼肉を楽しむ部活です。', '🥩', (SELECT id FROM members WHERE discord_user_id = '1530052808651309169' LIMIT 1), 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  leader_member_id = COALESCE(excluded.leader_member_id, clubs.leader_member_id),
  status = 'active',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO club_memberships (club_id, member_id, status, source, applied_at, approved_at, updated_at)
SELECT id, leader_member_id, 'approved', 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM clubs
WHERE id IN ('club-golf', 'club-meat') AND leader_member_id IS NOT NULL
ON CONFLICT(club_id, member_id) DO UPDATE SET
  status = 'approved', source = 'admin', approved_at = COALESCE(club_memberships.approved_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP;

UPDATE members
SET access_role = CASE WHEN role = 'user' AND access_role = 'member' THEN 'club_leader' ELSE access_role END,
    updated_at = CURRENT_TIMESTAMP
WHERE discord_user_id IN ('1507605842629890231', '1530052808651309169');

UPDATE system_metadata SET value = '27', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
