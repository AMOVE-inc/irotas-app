-- Expand shared XP operations for chat/comments and reversible awards.
CREATE TABLE xp_operation_requests_next (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('event_create','board_post','meal_report_post','chat_message','comment')),
  source_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  reason TEXT NOT NULL,
  xp_before INTEGER NOT NULL CHECK(xp_before >= 0),
  xp_after INTEGER,
  rank_before TEXT NOT NULL CHECK(rank_before IN ('regular','silver','gold','platinum')),
  rank_after TEXT CHECK(rank_after IN ('regular','silver','gold','platinum')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','reversed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  reversed_at TEXT,
  UNIQUE(member_id, action, source_id)
);

INSERT INTO xp_operation_requests_next
  (idempotency_key,member_id,action,source_id,amount,reason,xp_before,xp_after,rank_before,rank_after,status,created_at,completed_at)
SELECT idempotency_key,member_id,action,source_id,amount,reason,xp_before,xp_after,rank_before,rank_after,status,created_at,completed_at
FROM xp_operation_requests;

DROP TABLE xp_operation_requests;
ALTER TABLE xp_operation_requests_next RENAME TO xp_operation_requests;
CREATE INDEX idx_xp_operation_requests_member ON xp_operation_requests(member_id, created_at DESC);
CREATE INDEX idx_xp_operation_requests_source ON xp_operation_requests(action, source_id, status);

UPDATE system_metadata SET value = '63', updated_at = CURRENT_TIMESTAMP WHERE key = 'platform_schema_version';
PRAGMA optimize;
