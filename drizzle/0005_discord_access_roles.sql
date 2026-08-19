CREATE TABLE IF NOT EXISTS discord_access_role_assignments (
  discord_user_id TEXT PRIMARY KEY NOT NULL,
  discord_username TEXT,
  display_name TEXT NOT NULL,
  intended_access_role TEXT NOT NULL CHECK (intended_access_role IN ('club_leader', 'operator')),
  linked_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'linked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discord_access_role_assignments_status
ON discord_access_role_assignments(status, intended_access_role);

INSERT OR REPLACE INTO discord_access_role_assignments
  (discord_user_id, discord_username, display_name, intended_access_role, linked_member_id, status, created_at, updated_at)
VALUES
  ('1404762625077809152', 'sana0219', 'さな【運営】', 'operator', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1352978791483572326', 'shanbenyoutai_', 'もってぃー【運営】', 'operator', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('789786995970015242', 'takemaru7256', 'たけまる【運営】', 'operator', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1228712639903961190', 'nanakon99', 'Nana【運営】', 'operator', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('863786104033509418', 'sanibuyutsuhue2760', 'サニービュッフェ【運営】', 'operator', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1228681600594743387', '***.yu_no.', 'nonoka【運営】', 'operator', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1228677950401151139', 'eguchi.kazuma', 'かずま【運営】', 'operator', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1228677104577544362', '723.onomatope', '723【運営】', 'operator', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('817730242516746252', 'yuichiro9600', 'ユウ【運営】', 'operator', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1334056760863883294', 'irotas_community', 'IRO+運営', 'operator', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1119605898743120044', 'irotas.community', 'IRO+運営', 'operator', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1228678386902372374', NULL, 'nori（ランニング部長）', 'club_leader', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1228677952334725213', NULL, 'ami（パン部長）', 'club_leader', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1353587486604922921', NULL, 'みょん（料理教室部長）', 'club_leader', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1353010654189191178', NULL, '瑞季（旅行部長）', 'club_leader', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1457371560670265374', NULL, 'のんた（ディズニー部長）', 'club_leader', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1457652020164034686', NULL, 'Monako（散歩部長）', 'club_leader', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('959759896037961748', NULL, 'shimon（映画・ドラマ鑑賞部長）', 'club_leader', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1458772421887656090', NULL, 'Hono（舞台鑑賞部長）', 'club_leader', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1459195336991047815', NULL, 'しょうこ（スイーツ部長）', 'club_leader', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('1446344592214724700', NULL, '真妃（ワイン部長）', 'club_leader', NULL, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE discord_access_role_assignments
SET linked_member_id = (
      SELECT members.id
      FROM members
      WHERE members.discord_user_id = discord_access_role_assignments.discord_user_id
    ),
    status = CASE
      WHEN EXISTS (
        SELECT 1
        FROM members
        WHERE members.discord_user_id = discord_access_role_assignments.discord_user_id
      ) THEN 'linked'
      ELSE 'pending'
    END,
    updated_at = CURRENT_TIMESTAMP;

UPDATE members
SET role = CASE
      WHEN role = 'admin' OR access_role = 'admin' THEN 'admin'
      WHEN EXISTS (
        SELECT 1 FROM discord_access_role_assignments assignment
        WHERE assignment.discord_user_id = members.discord_user_id
          AND assignment.intended_access_role = 'operator'
      ) THEN 'operator'
      ELSE role
    END,
    access_role = CASE
      WHEN role = 'admin' OR access_role = 'admin' THEN 'admin'
      WHEN EXISTS (
        SELECT 1 FROM discord_access_role_assignments assignment
        WHERE assignment.discord_user_id = members.discord_user_id
          AND assignment.intended_access_role = 'operator'
      ) THEN 'operator'
      WHEN access_role = 'member' AND EXISTS (
        SELECT 1 FROM discord_access_role_assignments assignment
        WHERE assignment.discord_user_id = members.discord_user_id
          AND assignment.intended_access_role = 'club_leader'
      ) THEN 'club_leader'
      ELSE access_role
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE discord_user_id IN (SELECT discord_user_id FROM discord_access_role_assignments);

INSERT OR IGNORE INTO migration_runs
  (id, migration_type, source_filename, status, imported_count, skipped_count, error_count, summary_json, started_at, completed_at)
VALUES
  ('discord-access-roles-2026-08-19', 'discord_access_roles', 'Discord role migration 2026-08-19', 'completed', 21, 0, 0,
   '{"operatorAssignments":11,"clubLeaderAssignments":10}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO audit_logs
  (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
VALUES
  (NULL, 'discord_access_roles.migrate', 'migration_run', 'discord-access-roles-2026-08-19',
   '{"operatorAssignments":11,"clubLeaderAssignments":10,"source":"approved Discord user IDs"}', CURRENT_TIMESTAMP);

UPDATE system_metadata
SET value = '6', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
