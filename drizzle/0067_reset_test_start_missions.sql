ALTER TABLE member_start_mission_state ADD COLUMN reset_at TEXT;
ALTER TABLE member_start_mission_state ADD COLUMN profile_completed_at TEXT;

UPDATE members
SET xp = MAX(0, COALESCE(xp, 0) - (
      SELECT COUNT(*) * 10
      FROM member_start_mission_rewards rewards
      WHERE rewards.member_id = members.id AND rewards.status = 'applied'
    )),
    member_rank = CASE
      WHEN MAX(0, COALESCE(xp, 0) - (
        SELECT COUNT(*) * 10 FROM member_start_mission_rewards rewards
        WHERE rewards.member_id = members.id AND rewards.status = 'applied'
      )) >= 12000 THEN 'platinum'
      WHEN MAX(0, COALESCE(xp, 0) - (
        SELECT COUNT(*) * 10 FROM member_start_mission_rewards rewards
        WHERE rewards.member_id = members.id AND rewards.status = 'applied'
      )) >= 5500 THEN 'gold'
      WHEN MAX(0, COALESCE(xp, 0) - (
        SELECT COUNT(*) * 10 FROM member_start_mission_rewards rewards
        WHERE rewards.member_id = members.id AND rewards.status = 'applied'
      )) >= 1500 THEN 'silver'
      ELSE 'regular'
    END
WHERE LOWER(TRIM(user_handle)) = 'irotas.sample';

DELETE FROM member_start_mission_rewards
WHERE member_id = (SELECT id FROM members WHERE LOWER(TRIM(user_handle)) = 'irotas.sample' LIMIT 1);

INSERT INTO member_start_mission_state (member_id, guide_seen_at, created_at, updated_at, reset_at, profile_completed_at)
SELECT id, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM members
WHERE LOWER(TRIM(user_handle)) = 'irotas.sample'
ON CONFLICT(member_id) DO UPDATE SET
  guide_seen_at = NULL,
  reset_at = CURRENT_TIMESTAMP,
  profile_completed_at = NULL,
  updated_at = CURRENT_TIMESTAMP;
