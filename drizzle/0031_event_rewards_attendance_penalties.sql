-- IRO+ XP / attendance / cancellation policy. All timestamps are UTC ISO strings;
-- policy calculations are performed in the application with Asia/Tokyo boundaries.
CREATE TABLE IF NOT EXISTS event_attendance_confirmations (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('attended','absent')),
  confirmed_by_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  confirmed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_id, member_id)
);

CREATE TABLE IF NOT EXISTS event_attendance_finalizations (
  event_id TEXT PRIMARY KEY NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  finalized_by_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  finalized_at TEXT NOT NULL,
  actual_attendee_count INTEGER NOT NULL DEFAULT 0 CHECK(actual_attendee_count >= 0),
  corrected_at TEXT,
  corrected_by_member_id INTEGER REFERENCES members(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS event_xp_rewards (
  id TEXT PRIMARY KEY NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('event_created','event_completed_host','event_attendance_bonus','event_attendance','event_feedback')),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied' CHECK(status IN ('applied','reversed')),
  created_at TEXT NOT NULL,
  reversed_at TEXT,
  UNIQUE(member_id, event_id, action)
);
CREATE INDEX IF NOT EXISTS idx_event_xp_rewards_member_created ON event_xp_rewards(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_xp_rewards_event ON event_xp_rewards(event_id, status);

CREATE TABLE IF NOT EXISTS event_cancellation_penalties (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 1 CHECK(points = 1),
  assigned_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  assigned_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  UNIQUE(event_id, member_id)
);

ALTER TABLE event_cancellation_requests ADD COLUMN late_cancellation_at TEXT;
CREATE INDEX IF NOT EXISTS idx_event_cancellation_penalties_member_active ON event_cancellation_penalties(member_id, expires_at);

CREATE TABLE IF NOT EXISTS event_participation_restrictions (
  id TEXT PRIMARY KEY NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  trigger_penalty_id TEXT REFERENCES event_cancellation_penalties(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_participation_restrictions_member_ends ON event_participation_restrictions(member_id, ends_at);

CREATE TABLE IF NOT EXISTS board_helpful_answers (
  thread_id TEXT PRIMARY KEY NOT NULL REFERENCES board_threads(id) ON DELETE CASCADE,
  comment_id TEXT UNIQUE NOT NULL REFERENCES board_comments(id) ON DELETE CASCADE,
  selected_by_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  selected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS board_xp_rewards (
  id TEXT PRIMARY KEY NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES board_threads(id) ON DELETE CASCADE,
  comment_id TEXT NOT NULL REFERENCES board_comments(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action = 'helpful_answer'),
  amount INTEGER NOT NULL CHECK(amount = 5),
  status TEXT NOT NULL DEFAULT 'applied' CHECK(status IN ('applied','reversed')),
  created_at TEXT NOT NULL,
  reversed_at TEXT,
  UNIQUE(comment_id, action)
);

UPDATE system_metadata SET value = '31', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';
PRAGMA optimize;
