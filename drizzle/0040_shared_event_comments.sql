CREATE TABLE IF NOT EXISTS event_comments (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_public_id TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_comments_event_created
ON event_comments(event_id, created_at);

PRAGMA optimize;
