CREATE TABLE IF NOT EXISTS member_follows (
  follower_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  followed_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(follower_member_id, followed_member_id),
  CHECK(follower_member_id <> followed_member_id)
);

CREATE INDEX IF NOT EXISTS idx_member_follows_followed
ON member_follows(followed_member_id, follower_member_id);

UPDATE system_metadata
SET value = '14', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
