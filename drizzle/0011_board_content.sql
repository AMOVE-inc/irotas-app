CREATE TABLE IF NOT EXISTS board_threads (
  id TEXT PRIMARY KEY NOT NULL,
  author_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'none')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_board_threads_category_created
ON board_threads(category, pinned DESC, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_board_threads_author
ON board_threads(author_member_id, created_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS board_comments (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL REFERENCES board_threads(id) ON DELETE CASCADE,
  author_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_board_comments_thread_created
ON board_comments(thread_id, created_at)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_board_comments_author
ON board_comments(author_member_id, created_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS board_reactions (
  target_type TEXT NOT NULL CHECK(target_type IN ('thread', 'comment')),
  target_id TEXT NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(target_type, target_id, member_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_board_reactions_target
ON board_reactions(target_type, target_id);

UPDATE system_metadata
SET value = '12', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
