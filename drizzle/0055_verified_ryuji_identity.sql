-- Verified from the Discord server member record and the Square subscription
-- export: Discord riyuu4049 (759084159632277536) uses nonerows@gmail.com.
-- Link only that billing identity, and never take an ID owned by another row.
INSERT INTO discord_profile_snapshots
  (discord_user_id, display_name, avatar_url, bio, has_profile_bio,
   discord_joined_at, discord_roles_json, member_term, member_rank, imported_at)
VALUES (
  '759084159632277536',
  'ryuji',
  '',
  '',
  0,
  '2026-08-25T09:35:06.582000Z',
  '["レギュラー会員", "第7期メンバー", "散歩部🚶", "ワイン部🍷", "昼飲み部🍺", "肉部🍖"]',
  '第7期',
  'regular',
  CURRENT_TIMESTAMP
)
ON CONFLICT(discord_user_id) DO UPDATE SET
  display_name = excluded.display_name,
  discord_joined_at = excluded.discord_joined_at,
  discord_roles_json = excluded.discord_roles_json,
  member_term = excluded.member_term,
  member_rank = excluded.member_rank,
  imported_at = excluded.imported_at;

UPDATE members SET
  discord_user_id = '759084159632277536',
  display_name = CASE
    WHEN display_name = '' OR LOWER(TRIM(display_name)) = 'nonerows'
      OR LOWER(TRIM(display_name)) = LOWER(SUBSTR(email, 1, INSTR(email, '@') - 1))
    THEN 'ryuji'
    ELSE display_name
  END,
  member_term = '第7期',
  member_rank = 'regular',
  discord_roles_json = '["レギュラー会員", "第7期メンバー", "散歩部🚶", "ワイン部🍷", "昼飲み部🍺", "肉部🍖"]',
  discord_joined_at = '2026-08-25T09:35:06.582000Z',
  updated_at = CURRENT_TIMESTAMP
WHERE LOWER(TRIM(email)) = 'nonerows@gmail.com'
  AND (discord_user_id IS NULL OR discord_user_id = '759084159632277536')
  AND NOT EXISTS (
    SELECT 1 FROM members AS owner
    WHERE owner.discord_user_id = '759084159632277536'
      AND owner.id <> members.id
  );

INSERT INTO discord_club_membership_staging (discord_user_id, club_id, imported_at)
VALUES
  ('759084159632277536', 'club-walk', CURRENT_TIMESTAMP),
  ('759084159632277536', 'club-wine', CURRENT_TIMESTAMP),
  ('759084159632277536', 'club-day-drinking', CURRENT_TIMESTAMP),
  ('759084159632277536', 'club-meat', CURRENT_TIMESTAMP)
ON CONFLICT(discord_user_id, club_id) DO UPDATE SET imported_at = excluded.imported_at;

INSERT INTO club_memberships
  (club_id, member_id, status, source, applied_at, approved_at, updated_at)
SELECT staging.club_id, member.id, 'approved', 'discord',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM discord_club_membership_staging AS staging
JOIN members AS member ON member.discord_user_id = staging.discord_user_id
WHERE staging.discord_user_id = '759084159632277536'
ON CONFLICT(club_id, member_id) DO UPDATE SET
  status = 'approved',
  source = 'discord',
  approved_at = COALESCE(club_memberships.approved_at, excluded.approved_at),
  updated_at = excluded.updated_at;

INSERT INTO audit_logs
  (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
SELECT NULL, 'member.discord_identity_linked', 'member', CAST(id AS TEXT),
  json_object(
    'discordUserId', '759084159632277536',
    'discordUsername', 'riyuu4049',
    'source', '0055_verified_ryuji_identity'
  ),
  CURRENT_TIMESTAMP
FROM members
WHERE LOWER(TRIM(email)) = 'nonerows@gmail.com'
  AND discord_user_id = '759084159632277536';

PRAGMA optimize;
