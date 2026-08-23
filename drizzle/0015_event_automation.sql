ALTER TABLE in_app_notifications ADD COLUMN chat_room_id TEXT REFERENCES chat_rooms(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS event_automation_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  target_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN (
    'seven_days', 'two_days',
    'organizer_three_days', 'organizer_two_days', 'organizer_one_day', 'organizer_same_day',
    'favorite_three_days', 'favorite_one_day'
  )),
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'delivered')),
  delivered_at TEXT,
  UNIQUE(event_id, target_member_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_event_automation_deliveries_event
ON event_automation_deliveries(event_id, delivered_at DESC);

UPDATE system_metadata
SET value = '16', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
