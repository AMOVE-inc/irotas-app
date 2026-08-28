CREATE TABLE IF NOT EXISTS event_feedback_responses (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  overall_rating INTEGER NOT NULL CHECK(overall_rating BETWEEN 1 AND 5),
  food_rating INTEGER NOT NULL CHECK(food_rating BETWEEN 1 AND 5),
  venue_rating INTEGER NOT NULL CHECK(venue_rating BETWEEN 1 AND 5),
  community_rating INTEGER NOT NULL CHECK(community_rating BETWEEN 1 AND 5),
  would_attend_again INTEGER NOT NULL CHECK(would_attend_again IN (0, 1)),
  good_tags_json TEXT NOT NULL DEFAULT '[]',
  improvement_tags_json TEXT NOT NULL DEFAULT '[]',
  comment TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(event_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_event_feedback_event_submitted
ON event_feedback_responses(event_id, submitted_at DESC);

UPDATE system_metadata SET value = '23', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
