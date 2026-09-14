CREATE TABLE IF NOT EXISTS discord_profile_snapshots (
  discord_user_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  has_profile_bio INTEGER NOT NULL DEFAULT 0,
  discord_joined_at TEXT,
  discord_roles_json TEXT NOT NULL DEFAULT '[]',
  member_term TEXT,
  member_rank TEXT NOT NULL DEFAULT 'regular',
  imported_at TEXT NOT NULL
);

PRAGMA optimize;
