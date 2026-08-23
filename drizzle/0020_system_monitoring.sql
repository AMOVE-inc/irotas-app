CREATE TABLE IF NOT EXISTS application_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  error_name TEXT NOT NULL,
  error_message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_application_errors_created
ON application_errors(created_at DESC);

UPDATE system_metadata
SET value = '21', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
