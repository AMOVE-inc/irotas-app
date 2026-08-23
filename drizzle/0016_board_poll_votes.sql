CREATE TABLE IF NOT EXISTS board_poll_votes (
  owner_type TEXT NOT NULL CHECK(owner_type IN ('thread', 'comment')),
  owner_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(owner_type, owner_id, option_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_board_poll_votes_owner
ON board_poll_votes(owner_type, owner_id, created_at);

CREATE TABLE IF NOT EXISTS board_poll_finalizations (
  owner_type TEXT NOT NULL CHECK(owner_type IN ('thread', 'comment')),
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'delivered')),
  result_json TEXT,
  finalized_at TEXT,
  PRIMARY KEY(owner_type, owner_id)
);

UPDATE system_metadata
SET value = '17', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
