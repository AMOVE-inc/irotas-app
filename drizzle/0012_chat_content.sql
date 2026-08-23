CREATE TABLE IF NOT EXISTS chat_rooms (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL CHECK(room_type IN ('announcement', 'event', 'club', 'rank', 'board', 'dm', 'group')),
  source_id TEXT,
  required_rank TEXT,
  created_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_type_source
ON chat_rooms(room_type, source_id)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS chat_room_members (
  room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member' CHECK(member_role IN ('member', 'owner')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at TEXT,
  PRIMARY KEY(room_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_room_members_member
ON chat_room_members(member_id, room_id)
WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
ON chat_messages(room_id, created_at)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS chat_message_reactions (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(message_id, member_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message
ON chat_message_reactions(message_id);

CREATE TABLE IF NOT EXISTS chat_room_reads (
  room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY(room_id, member_id)
);

INSERT OR IGNORE INTO chat_rooms
  (id, name, room_type, source_id, created_at, updated_at)
VALUES
  ('board-announcement', '運営アナウンス', 'announcement', 'announcement', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO chat_rooms
  (id, name, room_type, source_id, required_rank, created_at, updated_at)
VALUES
  ('rank-silver', 'シルバーメンバールーム', 'rank', 'rank-silver', 'silver', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rank-gold', 'ゴールドメンバールーム', 'rank', 'rank-gold', 'gold', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rank-platinum', 'プラチナルーム', 'rank', 'rank-platinum', 'platinum', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE system_metadata
SET value = '13', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
