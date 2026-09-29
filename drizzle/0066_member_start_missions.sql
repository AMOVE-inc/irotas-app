CREATE TABLE IF NOT EXISTS member_start_mission_state (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  guide_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS member_start_mission_rewards (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  mission_key TEXT NOT NULL CHECK(mission_key IN ('profile','introduction','event_application','club_membership','meal_report','event_creation')),
  grant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied')),
  awarded_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, mission_key)
);

CREATE INDEX IF NOT EXISTS idx_member_start_mission_reward_grant
  ON member_start_mission_rewards(grant_id, status);
