CREATE TABLE IF NOT EXISTS member_push_tokens (
  token TEXT PRIMARY KEY NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('ios','android')),
  preferences_json TEXT NOT NULL DEFAULT '{}',
  last_seen_at TEXT NOT NULL,
  disabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_member_push_tokens_member ON member_push_tokens(member_id, disabled_at);

CREATE TABLE IF NOT EXISTS push_notification_deliveries (
  notification_id TEXT NOT NULL REFERENCES in_app_notifications(id) ON DELETE CASCADE,
  token TEXT NOT NULL REFERENCES member_push_tokens(token) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (notification_id, token)
);
CREATE INDEX IF NOT EXISTS idx_push_delivery_status ON push_notification_deliveries(status, created_at);

UPDATE system_metadata SET value = '64', updated_at = CURRENT_TIMESTAMP WHERE key = 'platform_schema_version';
PRAGMA optimize;
