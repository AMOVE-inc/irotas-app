CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  discord_user_id TEXT UNIQUE,
  public_member_id TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'operator', 'admin')),
  access_role TEXT NOT NULL DEFAULT 'member' CHECK (access_role IN ('member', 'club_leader', 'operator', 'admin')),
  branches_json TEXT NOT NULL DEFAULT '[]',
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'withdrawn')),
  password_set_at TEXT,
  last_signed_in_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_members_account_status_name
ON members(account_status, display_name);

CREATE TABLE IF NOT EXISTS member_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  billing_email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  square_customer_id TEXT UNIQUE,
  square_subscription_id TEXT UNIQUE,
  plan_variation_id TEXT,
  square_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (square_status IN ('PENDING', 'ACTIVE', 'CANCELED', 'DEACTIVATED', 'PAUSED', 'COMPLETED', 'UNKNOWN')),
  billing_status TEXT,
  access_status TEXT NOT NULL DEFAULT 'pending' CHECK (access_status IN ('pending', 'active', 'grace', 'suspended')),
  paid_until_date TEXT,
  overdue_since TEXT,
  grace_until_date TEXT,
  subscription_started_at TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_member_subscriptions_access
ON member_subscriptions(access_status, grace_until_date);

CREATE TABLE IF NOT EXISTS member_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_member_sessions_member_expiry
ON member_sessions(member_id, expires_at);

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('initial_setup', 'password_reset')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_codes_lookup
ON email_verification_codes(email, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  rate_key TEXT PRIMARY KEY NOT NULL,
  window_started_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS square_webhook_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  processing_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_square_webhook_received
ON square_webhook_events(received_at DESC);

UPDATE system_metadata
SET value = '2', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
