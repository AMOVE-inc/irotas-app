ALTER TABLE members ADD COLUMN member_term TEXT;
ALTER TABLE members ADD COLUMN member_rank TEXT NOT NULL DEFAULT 'regular';
ALTER TABLE members ADD COLUMN discord_roles_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE members ADD COLUMN achievement_badges_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE members ADD COLUMN discord_joined_at TEXT;
ALTER TABLE members ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE members ADD COLUMN xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0);
ALTER TABLE members ADD COLUMN participation_count INTEGER NOT NULL DEFAULT 0 CHECK (participation_count >= 0);
ALTER TABLE members ADD COLUMN organizer_count INTEGER NOT NULL DEFAULT 0 CHECK (organizer_count >= 0);

CREATE TABLE IF NOT EXISTS member_private_notes (
  owner_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  target_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_member_id, target_member_id),
  CHECK (owner_member_id != target_member_id),
  CHECK (length(note) <= 5000)
);

CREATE INDEX IF NOT EXISTS idx_member_private_notes_owner
ON member_private_notes(owner_member_id, updated_at DESC);

UPDATE system_metadata
SET value = '3', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
