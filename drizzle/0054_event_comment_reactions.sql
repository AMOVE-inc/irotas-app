CREATE TABLE IF NOT EXISTS event_comment_reactions (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  comment_id TEXT NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comment_id, member_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_event_comment_reactions_event_comment
  ON event_comment_reactions(event_id, comment_id);

PRAGMA optimize;
