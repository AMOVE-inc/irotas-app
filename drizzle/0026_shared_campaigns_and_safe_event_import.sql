-- Shared campaign management and conflict-safe Discord event imports.
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  target_rank TEXT NOT NULL DEFAULT 'all' CHECK (target_rank IN ('all', 'silver', 'gold', 'platinum')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'scheduled', 'ended')),
  type TEXT NOT NULL DEFAULT 'notification' CHECK (type IN ('points', 'event', 'gift', 'notification')),
  reach_count INTEGER NOT NULL DEFAULT 0 CHECK (reach_count >= 0),
  created_by_member_id INTEGER REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status_dates
ON campaigns(status, start_date, end_date);

INSERT OR IGNORE INTO campaigns
  (id, title, description, target_rank, start_date, end_date, status, type, reach_count)
VALUES
  ('c1', '幹事応援キャンペーン', 'メンバー主催のグルメ会を応援します。開催完了した幹事には20ptを付与します。キャンセル時は付与対象外です。', 'all', '2026-08-01', '2026-12-31', 'active', 'points', 500),
  ('c2', '友人招待キャンペーン', 'IRO+を一緒に楽しみたい友人をご紹介ください。紹介された方の入会完了後、運営から特典をご案内します。', 'all', '2026-08-01', '2026-12-31', 'active', 'notification', 500);

CREATE TABLE IF NOT EXISTS event_import_sources (
  event_id TEXT PRIMARY KEY NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_thread_id TEXT NOT NULL UNIQUE,
  source_snapshot_at TEXT,
  source_data_json TEXT NOT NULL DEFAULT '{}',
  applied_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_import_field_edits (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  edited_at TEXT NOT NULL,
  actor_member_id INTEGER REFERENCES members(id),
  PRIMARY KEY (event_id, field_name)
);

CREATE TABLE IF NOT EXISTS event_import_conflicts (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_thread_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  current_value_json TEXT NOT NULL,
  incoming_value_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by_member_id INTEGER REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_event_import_conflicts_run_status
ON event_import_conflicts(run_id, status, created_at);

CREATE TABLE IF NOT EXISTS backup_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  table_counts_json TEXT NOT NULL,
  created_by_member_id INTEGER NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO event_import_sources
  (event_id, source_thread_id, source_data_json, applied_at, updated_at)
SELECT id, 'discord-board-' || substr(id, length('discord-event-') + 1), public_data_json, created_at, CURRENT_TIMESTAMP
FROM events
WHERE id LIKE 'discord-event-%';

-- Existing administrator edits are treated conservatively: all editable fields
-- are protected so a later Discord snapshot cannot silently erase them.
INSERT OR IGNORE INTO event_import_field_edits (event_id, field_name, edited_at, actor_member_id)
SELECT e.id, fields.field_name, MAX(a.created_at), CAST(MAX(a.actor_user_id) AS INTEGER)
FROM events e
JOIN audit_logs a ON a.entity_type = 'event' AND a.entity_id = e.id AND a.action = 'event.edited'
CROSS JOIN (
  SELECT 'title' AS field_name UNION ALL
  SELECT 'description' UNION ALL
  SELECT 'manualParticipantIds'
) fields
WHERE e.id LIKE 'discord-event-%'
GROUP BY e.id, fields.field_name;

UPDATE system_metadata
SET value = '26', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
