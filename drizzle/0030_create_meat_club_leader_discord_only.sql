-- 肉部長はSquare未登録のDiscord専用会員として扱う。請求・Square会員情報は作成しない。
INSERT INTO members
  (email, display_name, role, access_role, branches_json, account_status,
   member_term, member_rank, discord_roles_json, profile_json, created_at, updated_at)
VALUES
  ('haaaagichan.groumet@gmail.com', 'はぎーちゃん🍖肉部長', 'user', 'club_leader', '["kanto"]', 'active',
   NULL, 'regular', '["肉部長","肉部"]', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  display_name = excluded.display_name,
  access_role = 'club_leader',
  discord_roles_json = excluded.discord_roles_json,
  updated_at = CURRENT_TIMESTAMP;

UPDATE clubs
SET leader_member_id = (SELECT id FROM members WHERE email = 'haaaagichan.groumet@gmail.com' LIMIT 1),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'club-meat';

INSERT INTO club_memberships (club_id, member_id, status, source, applied_at, approved_at, updated_at)
SELECT 'club-meat', id, 'approved', 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM members WHERE email = 'haaaagichan.groumet@gmail.com'
ON CONFLICT(club_id, member_id) DO UPDATE SET
  status = 'approved', source = 'admin', approved_at = COALESCE(club_memberships.approved_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP;

UPDATE system_metadata SET value = '30', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
