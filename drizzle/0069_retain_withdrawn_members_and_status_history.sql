-- Retain the original member record for audit/recovery while the public-facing
-- members row is anonymized after withdrawal. This table is not exposed by an API.
CREATE TABLE IF NOT EXISTS withdrawn_member_snapshots (
  member_id INTEGER PRIMARY KEY NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  discord_user_id TEXT,
  public_member_id TEXT,
  role TEXT NOT NULL,
  access_role TEXT NOT NULL,
  branches_json TEXT NOT NULL,
  member_term TEXT,
  discord_roles_json TEXT NOT NULL,
  achievement_badges_json TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  xp INTEGER NOT NULL,
  last_signed_in_at TEXT,
  retained_at TEXT NOT NULL,
  retention_reason TEXT NOT NULL DEFAULT 'account_withdrawal'
);

CREATE TABLE IF NOT EXISTS member_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  status_type TEXT NOT NULL CHECK(status_type IN ('account_status', 'subscription_access_status')),
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'database_trigger'
);

CREATE INDEX IF NOT EXISTS idx_member_status_history_member_changed
ON member_status_history(member_id, changed_at DESC, id DESC);

CREATE TRIGGER IF NOT EXISTS trg_members_account_status_history
AFTER UPDATE OF account_status ON members
WHEN OLD.account_status <> NEW.account_status
BEGIN
  INSERT INTO member_status_history
    (member_id, status_type, previous_status, new_status, changed_at, source)
  VALUES
    (NEW.id, 'account_status', OLD.account_status, NEW.account_status,
     COALESCE(NEW.updated_at, CURRENT_TIMESTAMP), 'members.account_status');
END;

CREATE TRIGGER IF NOT EXISTS trg_member_subscriptions_access_status_history
AFTER UPDATE OF access_status ON member_subscriptions
WHEN OLD.access_status <> NEW.access_status AND NEW.member_id IS NOT NULL
BEGIN
  INSERT INTO member_status_history
    (member_id, status_type, previous_status, new_status, changed_at, source)
  VALUES
    (NEW.member_id, 'subscription_access_status', OLD.access_status, NEW.access_status,
     COALESCE(NEW.updated_at, CURRENT_TIMESTAMP), 'member_subscriptions.access_status');
END;

UPDATE system_metadata
SET value = '69', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
