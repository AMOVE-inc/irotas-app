CREATE TABLE IF NOT EXISTS gourmet_map_candidates (
  id TEXT PRIMARY KEY,
  source_thread_id TEXT NOT NULL UNIQUE,
  report_title TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  area TEXT NOT NULL,
  member_rating REAL NOT NULL,
  member_comment TEXT NOT NULL,
  google_maps_url TEXT NOT NULL,
  image_url TEXT,
  place_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','ineligible')),
  reviewed_by_member_id INTEGER REFERENCES members(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gourmet_map_candidates_status
  ON gourmet_map_candidates(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_gourmet_map_candidates_place
  ON gourmet_map_candidates(place_id, status);
