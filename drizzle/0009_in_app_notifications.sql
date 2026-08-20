CREATE TABLE IF NOT EXISTS in_app_notifications (
  id TEXT PRIMARY KEY NOT NULL,
  target_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_target_created
ON in_app_notifications(target_member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_target_unread
ON in_app_notifications(target_member_id, read_at, created_at DESC);

UPDATE system_metadata
SET value = '10', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
