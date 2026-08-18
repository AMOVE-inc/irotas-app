CREATE TABLE IF NOT EXISTS event_participations (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('applied', 'confirmed', 'cancel_requested', 'cancelled', 'rejected')),
  terms_accepted_at TEXT,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  cancelled_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_event_participations_member_status
ON event_participations(member_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_participations_event_status
ON event_participations(event_id, status, updated_at);

CREATE TABLE IF NOT EXISTS event_favorites (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_event_favorites_member_created
ON event_favorites(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS event_cancellation_requests (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  contacted_organizer INTEGER NOT NULL CHECK (contacted_organizer IN (0, 1)),
  policy_confirmed INTEGER NOT NULL CHECK (policy_confirmed IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  reviewed_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_cancellation_requests_event_status
ON event_cancellation_requests(event_id, status, requested_at DESC);

UPDATE system_metadata
SET value = '5', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
