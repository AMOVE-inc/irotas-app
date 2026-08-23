CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id TEXT PRIMARY KEY NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'completed')),
  source TEXT NOT NULL CHECK (source IN ('app', 'web')),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scheduled_for TEXT NOT NULL,
  cancelled_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_member_pending
ON account_deletion_requests(member_id)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_account_deletion_status_scheduled
ON account_deletion_requests(status, scheduled_for);

UPDATE system_metadata
SET value = '22', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
