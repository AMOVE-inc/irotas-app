CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  leader_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clubs_status_name
ON clubs(status, name);

CREATE TABLE IF NOT EXISTS club_memberships (
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'on_hold', 'approved', 'rejected', 'left')),
  wants_to_do TEXT NOT NULL DEFAULT '',
  message_to_leader TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'discord', 'admin')),
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  decided_at TEXT,
  decided_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (club_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_club_memberships_member_status
ON club_memberships(member_id, status, club_id);

CREATE INDEX IF NOT EXISTS idx_club_memberships_club_status
ON club_memberships(club_id, status, applied_at);

INSERT INTO clubs (id, name, description, icon, leader_member_id, status)
VALUES
  ('club-disney', 'ディズニー部', 'ディズニーを一緒に楽しむ部活です。', '🐭', (SELECT id FROM members WHERE discord_user_id = '1457371560670265374'), 'active'),
  ('club-walk', '散歩部', '街歩きや季節の散策を楽しむ部活です。', '🚶', (SELECT id FROM members WHERE discord_user_id = '1457652020164034686'), 'active'),
  ('club-travel', '旅行部', '国内外の旅行情報や体験を共有する部活です。', '✈️', (SELECT id FROM members WHERE discord_user_id = '1353010654189191178'), 'active'),
  ('club-sports-watch', 'スポーツ観戦部', 'みんなでスポーツ観戦を楽しむ部活です。', '⚾️', (SELECT id FROM members WHERE discord_user_id = '916635788366708767'), 'active'),
  ('club-wine', 'ワイン部', 'ワインと食のペアリングを楽しむ部活です。', '🍷', (SELECT id FROM members WHERE discord_user_id = '1446344592214724700'), 'active'),
  ('club-bread', 'パン部', 'おいしいパン屋巡りや情報交換をする部活です。', '🍞', (SELECT id FROM members WHERE discord_user_id = '1228677952334725213'), 'active'),
  ('club-sweets', 'スイーツ部', '話題のスイーツやカフェを楽しむ部活です。', '🍰', (SELECT id FROM members WHERE discord_user_id = '1459195336991047815'), 'active'),
  ('club-cooking-class', '料理教室部', '料理を学び、作る楽しさを共有する部活です。', '🍳', (SELECT id FROM members WHERE discord_user_id = '1353587486604922921'), 'active'),
  ('club-day-drinking', '昼飲み部', '休日の昼飲みを気軽に楽しむ部活です。', '🍺', (SELECT id FROM members WHERE discord_user_id = '1353735645373136926'), 'active'),
  ('club-theater', '舞台鑑賞部', '舞台やミュージカルの鑑賞を楽しむ部活です。', '🎭', (SELECT id FROM members WHERE discord_user_id = '1458772421887656090'), 'active'),
  ('club-running', 'ランニング部', '無理なく楽しく走る部活です。', '🏃', (SELECT id FROM members WHERE discord_user_id = '1228678386902372374'), 'active'),
  ('club-sports', 'スポーツ部', 'さまざまなスポーツを一緒に楽しむ部活です。', '🏀', (SELECT id FROM members WHERE discord_user_id = '1403348999557222473'), 'active')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  leader_member_id = COALESCE(excluded.leader_member_id, clubs.leader_member_id),
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO club_memberships
  (club_id, member_id, status, source, applied_at, approved_at, updated_at)
SELECT c.id, c.leader_member_id, 'approved', 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM clubs c
WHERE c.leader_member_id IS NOT NULL
ON CONFLICT(club_id, member_id) DO UPDATE SET
  status = 'approved', source = 'admin', approved_at = COALESCE(club_memberships.approved_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP;

INSERT INTO club_memberships
  (club_id, member_id, status, source, applied_at, approved_at, updated_at)
SELECT c.id, m.id, 'approved', 'discord', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM clubs c
CROSS JOIN members m
CROSS JOIN json_each(CASE WHEN json_valid(m.discord_roles_json) THEN m.discord_roles_json ELSE '[]' END) r
WHERE CAST(r.value AS TEXT) LIKE '%' || c.name || '%'
ON CONFLICT(club_id, member_id) DO UPDATE SET
  status = CASE WHEN club_memberships.status = 'approved' THEN club_memberships.status ELSE 'approved' END,
  source = CASE WHEN club_memberships.status = 'approved' THEN club_memberships.source ELSE 'discord' END,
  approved_at = COALESCE(club_memberships.approved_at, CURRENT_TIMESTAMP),
  updated_at = CURRENT_TIMESTAMP;

UPDATE members
SET access_role = 'club_leader', updated_at = CURRENT_TIMESTAMP
WHERE role = 'user'
  AND access_role = 'member'
  AND id IN (SELECT leader_member_id FROM clubs WHERE leader_member_id IS NOT NULL);

INSERT OR IGNORE INTO migration_runs
  (id, migration_type, source_filename, status, imported_count, skipped_count, error_count, summary_json, started_at, completed_at)
VALUES
  ('club-memberships-2026-08-20', 'discord_club_memberships', 'Discord club roles', 'completed',
   (SELECT COUNT(*) FROM club_memberships WHERE source IN ('discord', 'admin') AND status = 'approved'), 0, 0,
   '{"clubs":12,"source":"members.discord_roles_json","leaderAssignments":12}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO audit_logs
  (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
VALUES
  (NULL, 'club_memberships.migrate', 'migration_run', 'club-memberships-2026-08-20',
   '{"clubs":12,"source":"Discord roles and approved leader IDs"}', CURRENT_TIMESTAMP);

UPDATE system_metadata
SET value = '9', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
