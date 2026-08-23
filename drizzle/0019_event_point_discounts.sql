CREATE TABLE IF NOT EXISTS event_point_usages (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK(amount > 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  status TEXT NOT NULL DEFAULT 'applied' CHECK(status IN ('applied', 'refunded')),
  applied_transaction_id TEXT NOT NULL,
  refund_transaction_id TEXT,
  applied_at TEXT NOT NULL,
  refunded_at TEXT,
  PRIMARY KEY(event_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_event_point_usages_status
ON event_point_usages(event_id, status);

UPDATE system_metadata
SET value = '20', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
