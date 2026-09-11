-- 廃部になった映画・ドラマ鑑賞部を、一覧・所属・掲示板から削除する。
UPDATE board_threads SET category = 'club-club-sports-watch', updated_at = CURRENT_TIMESTAMP WHERE category = 'club-club-sports-viewing';
UPDATE board_threads SET category = 'club-club-cooking-class', updated_at = CURRENT_TIMESTAMP WHERE category = 'club-club-cooking';
UPDATE board_threads SET category = 'club-club-theater', updated_at = CURRENT_TIMESTAMP WHERE category = 'club-club-stage';

UPDATE board_threads
SET deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND (
    category = 'club-club-movie'
    OR (category = 'club-all' AND (title LIKE '%映画・ドラマ鑑賞部%' OR title LIKE '%映画ドラマ鑑賞部%'))
  );

DELETE FROM club_memberships
WHERE club_id IN ('club-movies', 'club-movie');

DELETE FROM clubs
WHERE id IN ('club-movies', 'club-movie')
   OR name = '映画・ドラマ鑑賞部';

UPDATE members
SET discord_roles_json = COALESCE((
      SELECT json_group_array(value)
      FROM json_each(CASE WHEN json_valid(members.discord_roles_json) THEN members.discord_roles_json ELSE '[]' END)
      WHERE CAST(value AS TEXT) NOT LIKE '%映画%ドラマ%鑑賞部%'
    ), '[]'),
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM json_each(CASE WHEN json_valid(members.discord_roles_json) THEN members.discord_roles_json ELSE '[]' END)
  WHERE CAST(value AS TEXT) LIKE '%映画%ドラマ%鑑賞部%'
);

INSERT OR IGNORE INTO migration_runs
  (id, migration_type, source_filename, status, imported_count, skipped_count, error_count, summary_json, started_at, completed_at)
VALUES
  ('retire-movie-drama-club-20260912', 'club_retirement', 'product-request', 'completed',
   1, 0, 0, '{"club":"映画・ドラマ鑑賞部","removed":"club, memberships, roles, threads"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

PRAGMA optimize;
