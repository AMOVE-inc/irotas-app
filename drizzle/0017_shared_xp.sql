CREATE TABLE IF NOT EXISTS xp_operation_requests (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('event_create', 'board_post', 'meal_report_post')),
  source_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  reason TEXT NOT NULL,
  xp_before INTEGER NOT NULL CHECK(xp_before >= 0),
  xp_after INTEGER,
  rank_before TEXT NOT NULL CHECK(rank_before IN ('regular', 'silver', 'gold', 'platinum')),
  rank_after TEXT CHECK(rank_after IN ('regular', 'silver', 'gold', 'platinum')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'applied')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE(member_id, action, source_id)
);

CREATE INDEX IF NOT EXISTS idx_xp_operation_requests_member
ON xp_operation_requests(member_id, created_at DESC);

UPDATE system_metadata
SET value = '18', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
