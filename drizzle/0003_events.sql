CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  organizer_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('official', 'gourmet', 'club')),
  club_id TEXT,
  event_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'full', 'ended', 'cancelled')),
  title TEXT NOT NULL,
  public_data_json TEXT NOT NULL,
  private_memo TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_date_status
ON events(event_date, status);

CREATE INDEX IF NOT EXISTS idx_events_type_date
ON events(event_type, event_date);

CREATE INDEX IF NOT EXISTS idx_events_organizer_date
ON events(organizer_member_id, event_date DESC);

UPDATE system_metadata
SET value = '4', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
