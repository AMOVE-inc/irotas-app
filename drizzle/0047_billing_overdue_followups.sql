CREATE TABLE IF NOT EXISTS billing_overdue_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  square_subscription_id TEXT NOT NULL,
  overdue_since TEXT NOT NULL,
  follow_up_type TEXT NOT NULL CHECK (follow_up_type IN ('initial', 'week_1')),
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempted_at TEXT NOT NULL,
  sent_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(square_subscription_id, overdue_since, follow_up_type)
);

CREATE INDEX IF NOT EXISTS idx_billing_overdue_followups_status
ON billing_overdue_followups(status, attempted_at);

PRAGMA optimize;
