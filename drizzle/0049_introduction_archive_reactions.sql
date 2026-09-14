CREATE TABLE IF NOT EXISTS introduction_archive_reactions (
  source_id TEXT NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(source_id, member_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_introduction_archive_reactions_source
ON introduction_archive_reactions(source_id);
