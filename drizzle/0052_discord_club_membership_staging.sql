CREATE TABLE IF NOT EXISTS discord_club_membership_staging (
  discord_user_id TEXT NOT NULL,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (discord_user_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_club_membership_staging_club
ON discord_club_membership_staging(club_id);
