CREATE TABLE IF NOT EXISTS deleted_imported_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  deleted_at TEXT NOT NULL,
  deleted_by_member_id INTEGER NOT NULL REFERENCES members(id)
);

PRAGMA optimize;
