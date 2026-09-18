-- The 2026-09-14 Discord export was imported completely. These verified club
-- roles were added after that snapshot, so reconcile them without guessing by
-- display name. Every link below requires the exact billing email and refuses
-- to take a Discord ID already owned by another member row.

UPDATE members SET
  discord_user_id = '1531839895780458667',
  member_term = '第7期',
  member_rank = 'regular',
  discord_roles_json = '["レギュラー会員", "関東支部", "第7期メンバー", "スポーツ観戦部⚾️", "ゴルフ部⛳️"]',
  discord_joined_at = COALESCE(discord_joined_at, '2026-07-29T02:07:34Z'),
  updated_at = CURRENT_TIMESTAMP
WHERE public_member_id = 'IRO0437'
  AND LOWER(TRIM(email)) = '02.ehtnadohr@gmail.com'
  AND (discord_user_id IS NULL OR discord_user_id = '1531839895780458667')
  AND NOT EXISTS (
    SELECT 1 FROM members AS owner
    WHERE owner.discord_user_id = '1531839895780458667'
      AND owner.id <> members.id
  );

INSERT INTO discord_profile_snapshots
  (discord_user_id, display_name, avatar_url, bio, has_profile_bio,
   discord_joined_at, discord_roles_json, member_term, member_rank, imported_at)
SELECT
  '1531839895780458667', display_name, '', '', 0,
  COALESCE(discord_joined_at, '2026-07-29T02:07:34Z'),
  discord_roles_json, member_term, member_rank, CURRENT_TIMESTAMP
FROM members
WHERE public_member_id = 'IRO0437'
  AND LOWER(TRIM(email)) = '02.ehtnadohr@gmail.com'
  AND discord_user_id = '1531839895780458667'
ON CONFLICT(discord_user_id) DO UPDATE SET
  display_name = excluded.display_name,
  discord_joined_at = excluded.discord_joined_at,
  discord_roles_json = excluded.discord_roles_json,
  member_term = excluded.member_term,
  member_rank = excluded.member_rank,
  imported_at = excluded.imported_at;

-- Two additional post-snapshot club additions were visible in the Discord
-- audit log. Link only the exact exported email/Discord ID pairs and preserve
-- their other member/profile fields.
UPDATE members SET
  discord_user_id = '396760147138969612',
  updated_at = CURRENT_TIMESTAMP
WHERE LOWER(TRIM(email)) = 'ue.murataku.nada@gmail.com'
  AND (discord_user_id IS NULL OR discord_user_id = '396760147138969612')
  AND NOT EXISTS (
    SELECT 1 FROM members AS owner
    WHERE owner.discord_user_id = '396760147138969612'
      AND owner.id <> members.id
  );

UPDATE members SET
  discord_user_id = '1546702989870506129',
  updated_at = CURRENT_TIMESTAMP
WHERE LOWER(TRIM(email)) = 'yuukanaru1022@icloud.com'
  AND (discord_user_id IS NULL OR discord_user_id = '1546702989870506129')
  AND NOT EXISTS (
    SELECT 1 FROM members AS owner
    WHERE owner.discord_user_id = '1546702989870506129'
      AND owner.id <> members.id
  );

INSERT INTO discord_club_membership_staging (discord_user_id, club_id, imported_at)
VALUES
  ('1531839895780458667', 'club-sports-watch', CURRENT_TIMESTAMP),
  ('1531839895780458667', 'club-golf', CURRENT_TIMESTAMP),
  ('396760147138969612', 'club-travel', CURRENT_TIMESTAMP),
  ('396760147138969612', 'club-sweets', CURRENT_TIMESTAMP),
  ('396760147138969612', 'club-walk', CURRENT_TIMESTAMP),
  ('396760147138969612', 'club-running', CURRENT_TIMESTAMP),
  ('396760147138969612', 'club-wine', CURRENT_TIMESTAMP),
  ('1546702989870506129', 'club-bread', CURRENT_TIMESTAMP)
ON CONFLICT(discord_user_id, club_id) DO UPDATE SET imported_at = excluded.imported_at;

INSERT INTO club_memberships
  (club_id, member_id, status, source, applied_at, approved_at, updated_at)
SELECT staging.club_id, member.id, 'approved', 'discord',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM discord_club_membership_staging AS staging
JOIN members AS member ON member.discord_user_id = staging.discord_user_id
WHERE staging.discord_user_id IN (
  '1531839895780458667',
  '396760147138969612',
  '1546702989870506129'
)
ON CONFLICT(club_id, member_id) DO UPDATE SET
  status = 'approved',
  source = 'discord',
  approved_at = COALESCE(club_memberships.approved_at, excluded.approved_at),
  updated_at = excluded.updated_at;

INSERT INTO audit_logs
  (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
SELECT NULL, 'member.discord_clubs_reconciled', 'member', CAST(id AS TEXT),
  json_object(
    'discordUserId', discord_user_id,
    'source', '0056_reconcile_post_snapshot_discord_clubs'
  ),
  CURRENT_TIMESTAMP
FROM members
WHERE discord_user_id IN (
  '1531839895780458667',
  '396760147138969612',
  '1546702989870506129'
);

PRAGMA optimize;
