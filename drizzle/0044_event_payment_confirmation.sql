-- 有料公式イベントの応募と決済待ちを区別する。既存の参加確定記録は維持する。
ALTER TABLE event_participations ADD COLUMN payment_state TEXT
  CHECK (payment_state IN ('awaiting_selection', 'awaiting_payment', 'completed'));

CREATE INDEX IF NOT EXISTS idx_event_participations_payment_state
ON event_participations(event_id, payment_state, status);
