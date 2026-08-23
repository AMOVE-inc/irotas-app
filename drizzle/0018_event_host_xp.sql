CREATE TABLE IF NOT EXISTS event_host_xp_operations (
  event_id TEXT PRIMARY KEY NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 20 CHECK(amount = 20),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'applied', 'reversed')),
  xp_before INTEGER NOT NULL CHECK(xp_before >= 0),
  xp_after INTEGER,
  applied_at TEXT,
  reversed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_host_xp_member
ON event_host_xp_operations(member_id, created_at DESC);

UPDATE system_metadata
SET value = '19', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
