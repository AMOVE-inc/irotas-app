CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_announcements_visible_created
ON announcements(created_at DESC)
WHERE deleted_at IS NULL;

UPDATE system_metadata
SET value = '34', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
