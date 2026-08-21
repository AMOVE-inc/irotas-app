INSERT INTO members
  (email, display_name, public_member_id, role, access_role, branches_json,
   account_status, member_rank, profile_json, created_at, updated_at)
VALUES
  ('kanon1998915@icloud.com', '一般メンバーテスト', 'IRO-TEST-001',
   'user', 'member', '[]', 'active', 'regular',
   '{"isTestAccount":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  display_name = CASE
    WHEN members.display_name = '' OR members.display_name = '未設定'
      THEN excluded.display_name
    ELSE members.display_name
  END,
  public_member_id = COALESCE(NULLIF(members.public_member_id, ''), excluded.public_member_id),
  role = 'user',
  access_role = 'member',
  account_status = 'active',
  member_rank = 'regular',
  profile_json = json_set(
    CASE WHEN json_valid(members.profile_json) THEN members.profile_json ELSE '{}' END,
    '$.isTestAccount',
    json('true')
  ),
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO member_subscriptions
  (member_id, billing_email, square_status, billing_status, access_status,
   subscription_started_at, last_verified_at, created_at, updated_at)
VALUES
  ((SELECT id FROM members WHERE email = 'kanon1998915@icloud.com'),
   'kanon1998915@icloud.com', 'ACTIVE', 'TEST_ACCOUNT', 'active',
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(billing_email) DO UPDATE SET
  member_id = excluded.member_id,
  square_customer_id = NULL,
  square_subscription_id = NULL,
  plan_variation_id = NULL,
  square_status = 'ACTIVE',
  billing_status = 'TEST_ACCOUNT',
  access_status = 'active',
  paid_until_date = NULL,
  overdue_since = NULL,
  grace_until_date = NULL,
  last_verified_at = excluded.last_verified_at,
  updated_at = excluded.updated_at;

INSERT INTO audit_logs
  (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
VALUES
  (NULL, 'qa.general_member_account_created', 'member',
   (SELECT CAST(id AS TEXT) FROM members WHERE email = 'kanon1998915@icloud.com'),
   '{"email":"kanon1998915@icloud.com","accessRole":"member","excludedFromMemberDirectory":true,"squareProductionRecord":false}',
   CURRENT_TIMESTAMP);

UPDATE system_metadata
SET value = '11', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
