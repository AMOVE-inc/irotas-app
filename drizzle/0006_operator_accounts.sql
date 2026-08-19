INSERT INTO members
  (email, display_name, discord_user_id, public_member_id, role, access_role, branches_json,
   member_term, member_rank, discord_roles_json, discord_joined_at, account_status, created_at, updated_at)
VALUES
  ('marina.yamasawa@gmail.com', 'さな【運営】', '1404762625077809152',
   (SELECT printf('IRO%04d', COALESCE(MAX(CAST(SUBSTR(public_member_id, 4) AS INTEGER)), 0) + 1) FROM members WHERE public_member_id GLOB 'IRO[0-9]*'),
   'operator', 'operator', '["kanto"]', '第5期', 'regular',
   '["昼飲み部🍺","散歩部🚶","第5期メンバー","関東支部","運営メンバー","ワイン部🍷","旅行部✈️"]',
   '2025-08-18', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  display_name = CASE WHEN members.display_name = '未設定' THEN excluded.display_name ELSE members.display_name END,
  discord_user_id = COALESCE(members.discord_user_id, excluded.discord_user_id),
  role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  access_role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  branches_json = excluded.branches_json,
  member_term = excluded.member_term,
  discord_roles_json = excluded.discord_roles_json,
  discord_joined_at = excluded.discord_joined_at,
  account_status = 'active',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO members
  (email, display_name, discord_user_id, public_member_id, role, access_role, branches_json,
   member_term, member_rank, discord_roles_json, discord_joined_at, account_status, created_at, updated_at)
VALUES
  ('xinohenggang@gmail.com', 'もってぃー【運営】', '1352978791483572326',
   (SELECT printf('IRO%04d', COALESCE(MAX(CAST(SUBSTR(public_member_id, 4) AS INTEGER)), 0) + 1) FROM members WHERE public_member_id GLOB 'IRO[0-9]*'),
   'operator', 'operator', '["kanto"]', '第4期', 'regular',
   '["第4期メンバー","昼飲み部🍺","関東支部","運営メンバー","ワイン部🍷","【部長】スポーツ観戦部⚾️","旅行部✈️"]',
   '2025-03-22', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  display_name = CASE WHEN members.display_name = '未設定' THEN excluded.display_name ELSE members.display_name END,
  discord_user_id = COALESCE(members.discord_user_id, excluded.discord_user_id),
  role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  access_role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  branches_json = excluded.branches_json,
  member_term = excluded.member_term,
  discord_roles_json = excluded.discord_roles_json,
  discord_joined_at = excluded.discord_joined_at,
  account_status = 'active',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO members
  (email, display_name, discord_user_id, public_member_id, role, access_role, branches_json,
   member_term, member_rank, discord_roles_json, discord_joined_at, account_status, created_at, updated_at)
VALUES
  ('flagsregister@gmail.com', 'たけまる【運営】', '789786995970015242',
   (SELECT printf('IRO%04d', COALESCE(MAX(CAST(SUBSTR(public_member_id, 4) AS INTEGER)), 0) + 1) FROM members WHERE public_member_id GLOB 'IRO[0-9]*'),
   'operator', 'operator', '["kanto"]', '第3期', 'regular',
   '["昼飲み部🍺","散歩部🚶","関東支部","運営メンバー","料理教室部🍳","スポーツ部🏀","第3期メンバー"]',
   '2024-10-13', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  display_name = CASE WHEN members.display_name = '未設定' THEN excluded.display_name ELSE members.display_name END,
  discord_user_id = COALESCE(members.discord_user_id, excluded.discord_user_id),
  role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  access_role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  branches_json = excluded.branches_json,
  member_term = excluded.member_term,
  discord_roles_json = excluded.discord_roles_json,
  discord_joined_at = excluded.discord_joined_at,
  account_status = 'active',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO members
  (email, display_name, discord_user_id, public_member_id, role, access_role, branches_json,
   member_term, member_rank, discord_roles_json, discord_joined_at, account_status, created_at, updated_at)
VALUES
  ('koronbinu0827@gmail.com', 'Nana【運営】', '1228712639903961190',
   (SELECT printf('IRO%04d', COALESCE(MAX(CAST(SUBSTR(public_member_id, 4) AS INTEGER)), 0) + 1) FROM members WHERE public_member_id GLOB 'IRO[0-9]*'),
   'operator', 'operator', '["kanto","kansai"]', '第1期', 'regular',
   '["関東支部","運営メンバー","ワイン部🍷","第1期メンバー","関西支部"]',
   '2024-04-13', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  display_name = CASE WHEN members.display_name = '未設定' THEN excluded.display_name ELSE members.display_name END,
  discord_user_id = COALESCE(members.discord_user_id, excluded.discord_user_id),
  role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  access_role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  branches_json = excluded.branches_json,
  member_term = excluded.member_term,
  discord_roles_json = excluded.discord_roles_json,
  discord_joined_at = excluded.discord_joined_at,
  account_status = 'active',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO members
  (email, display_name, discord_user_id, public_member_id, role, access_role, branches_json,
   member_term, member_rank, discord_roles_json, discord_joined_at, account_status, created_at, updated_at)
VALUES
  ('rikoriko12241120@gmail.com', 'サニービュッフェ【運営】', '863786104033509418',
   (SELECT printf('IRO%04d', COALESCE(MAX(CAST(SUBSTR(public_member_id, 4) AS INTEGER)), 0) + 1) FROM members WHERE public_member_id GLOB 'IRO[0-9]*'),
   'operator', 'operator', '["kansai"]', '第1期', 'regular',
   '["運営メンバー","関西支部","第1期メンバー"]',
   '2024-04-14', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  display_name = CASE WHEN members.display_name = '未設定' THEN excluded.display_name ELSE members.display_name END,
  discord_user_id = COALESCE(members.discord_user_id, excluded.discord_user_id),
  role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  access_role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  branches_json = excluded.branches_json,
  member_term = excluded.member_term,
  discord_roles_json = excluded.discord_roles_json,
  discord_joined_at = excluded.discord_joined_at,
  account_status = 'active',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO members
  (email, display_name, discord_user_id, public_member_id, role, access_role, branches_json,
   member_term, member_rank, discord_roles_json, discord_joined_at, account_status, created_at, updated_at)
VALUES
  ('n.lucky-flower.k@ezweb.ne.jp', 'nonoka【運営】', '1228681600594743387',
   (SELECT printf('IRO%04d', COALESCE(MAX(CAST(SUBSTR(public_member_id, 4) AS INTEGER)), 0) + 1) FROM members WHERE public_member_id GLOB 'IRO[0-9]*'),
   'operator', 'operator', '["kansai"]', '第1期', 'regular',
   '["運営メンバー","関西支部","第1期メンバー"]',
   '2024-04-13', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  display_name = CASE WHEN members.display_name = '未設定' THEN excluded.display_name ELSE members.display_name END,
  discord_user_id = COALESCE(members.discord_user_id, excluded.discord_user_id),
  role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  access_role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  branches_json = excluded.branches_json,
  member_term = excluded.member_term,
  discord_roles_json = excluded.discord_roles_json,
  discord_joined_at = excluded.discord_joined_at,
  account_status = 'active',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO members
  (email, display_name, discord_user_id, public_member_id, role, access_role, branches_json,
   member_term, member_rank, discord_roles_json, discord_joined_at, account_status, created_at, updated_at)
VALUES
  ('eguchi.work0419@gmail.com', 'かずま【運営】', '1228677950401151139',
   (SELECT printf('IRO%04d', COALESCE(MAX(CAST(SUBSTR(public_member_id, 4) AS INTEGER)), 0) + 1) FROM members WHERE public_member_id GLOB 'IRO[0-9]*'),
   'operator', 'operator', '["kanto","kansai"]', '第1期', 'regular',
   '["関東支部","運営メンバー","関西支部","第1期メンバー"]',
   '2024-04-13', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  display_name = CASE WHEN members.display_name = '未設定' THEN excluded.display_name ELSE members.display_name END,
  discord_user_id = COALESCE(members.discord_user_id, excluded.discord_user_id),
  role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  access_role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  branches_json = excluded.branches_json,
  member_term = excluded.member_term,
  discord_roles_json = excluded.discord_roles_json,
  discord_joined_at = excluded.discord_joined_at,
  account_status = 'active',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO members
  (email, display_name, discord_user_id, public_member_id, role, access_role, branches_json,
   member_term, member_rank, discord_roles_json, discord_joined_at, account_status, created_at, updated_at)
VALUES
  ('sp.8723.cregao@gmail.com', '723【運営】', '1228677104577544362',
   (SELECT printf('IRO%04d', COALESCE(MAX(CAST(SUBSTR(public_member_id, 4) AS INTEGER)), 0) + 1) FROM members WHERE public_member_id GLOB 'IRO[0-9]*'),
   'operator', 'operator', '["kanto","kansai"]', '第1期', 'regular',
   '["関東支部","運営メンバー","関西支部","第1期メンバー"]',
   '2024-04-13', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  display_name = CASE WHEN members.display_name = '未設定' THEN excluded.display_name ELSE members.display_name END,
  discord_user_id = COALESCE(members.discord_user_id, excluded.discord_user_id),
  role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  access_role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  branches_json = excluded.branches_json,
  member_term = excluded.member_term,
  discord_roles_json = excluded.discord_roles_json,
  discord_joined_at = excluded.discord_joined_at,
  account_status = 'active',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO members
  (email, display_name, discord_user_id, public_member_id, role, access_role, branches_json,
   member_term, member_rank, discord_roles_json, discord_joined_at, account_status, created_at, updated_at)
VALUES
  ('u-b.m.l-721-yuu51@docomo.ne.jp', 'ユウ【運営】', '817730242516746252',
   (SELECT printf('IRO%04d', COALESCE(MAX(CAST(SUBSTR(public_member_id, 4) AS INTEGER)), 0) + 1) FROM members WHERE public_member_id GLOB 'IRO[0-9]*'),
   'operator', 'operator', '["kansai"]', '第1期', 'regular',
   '["運営メンバー","関西支部","第1期メンバー"]',
   '2024-04-13', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  display_name = CASE WHEN members.display_name = '未設定' THEN excluded.display_name ELSE members.display_name END,
  discord_user_id = COALESCE(members.discord_user_id, excluded.discord_user_id),
  role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  access_role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  branches_json = excluded.branches_json,
  member_term = excluded.member_term,
  discord_roles_json = excluded.discord_roles_json,
  discord_joined_at = excluded.discord_joined_at,
  account_status = 'active',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO members
  (email, display_name, discord_user_id, public_member_id, role, access_role, branches_json,
   member_term, member_rank, discord_roles_json, discord_joined_at, account_status, created_at, updated_at)
VALUES
  ('k1998915n@gmail.com', 'IRO+運営', '1334056760863883294',
   (SELECT printf('IRO%04d', COALESCE(MAX(CAST(SUBSTR(public_member_id, 4) AS INTEGER)), 0) + 1) FROM members WHERE public_member_id GLOB 'IRO[0-9]*'),
   'operator', 'operator', '[]', NULL, 'regular', '["運営メンバー"]',
   '2025-01-29', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  display_name = CASE WHEN members.display_name = '未設定' THEN excluded.display_name ELSE members.display_name END,
  discord_user_id = COALESCE(members.discord_user_id, excluded.discord_user_id),
  role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  access_role = CASE WHEN members.role = 'admin' OR members.access_role = 'admin' THEN 'admin' ELSE 'operator' END,
  branches_json = excluded.branches_json,
  member_term = excluded.member_term,
  discord_roles_json = excluded.discord_roles_json,
  discord_joined_at = excluded.discord_joined_at,
  account_status = 'active',
  updated_at = CURRENT_TIMESTAMP;

UPDATE discord_access_role_assignments
SET discord_username = '_.yu_no._'
WHERE discord_user_id = '1228681600594743387';

UPDATE discord_access_role_assignments
SET linked_member_id = (
      SELECT members.id
      FROM members
      WHERE members.discord_user_id = discord_access_role_assignments.discord_user_id
    ),
    status = CASE
      WHEN EXISTS (
        SELECT 1 FROM members
        WHERE members.discord_user_id = discord_access_role_assignments.discord_user_id
      ) THEN 'linked'
      ELSE 'pending'
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE intended_access_role = 'operator';

INSERT OR IGNORE INTO migration_runs
  (id, migration_type, source_filename, status, imported_count, skipped_count, error_count, summary_json, started_at, completed_at)
VALUES
  ('operator-accounts-2026-08-19', 'operator_accounts', 'Discord members.csv', 'completed', 10, 1, 0,
   '{"createdOrUpdated":10,"existingAdminPreserved":1,"subscriptionExempt":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO audit_logs
  (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
VALUES
  ('1', 'operator_accounts.migrate', 'migration_run', 'operator-accounts-2026-08-19',
   '{"createdOrUpdated":10,"existingAdminPreserved":1,"source":"Discord members.csv and user confirmation"}', CURRENT_TIMESTAMP);

UPDATE system_metadata
SET value = '7', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
