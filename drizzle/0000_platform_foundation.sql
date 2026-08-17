CREATE TABLE IF NOT EXISTS system_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stored_files (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stored_files_owner_created
ON stored_files(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created
ON audit_logs(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
ON audit_logs(actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS migration_runs (
  id TEXT PRIMARY KEY NOT NULL,
  migration_type TEXT NOT NULL,
  source_filename TEXT,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'rolled_back')),
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

INSERT OR IGNORE INTO system_metadata (key, value)
VALUES ('platform_schema_version', '1');

PRAGMA optimize;
