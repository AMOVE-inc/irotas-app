CREATE TABLE IF NOT EXISTS google_maps_api_usage (
  usage_kind TEXT NOT NULL CHECK (usage_kind IN ('photo', 'search')),
  month_key TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (usage_kind, month_key)
);

PRAGMA optimize;
