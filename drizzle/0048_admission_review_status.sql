CREATE TABLE IF NOT EXISTS admission_review_statuses (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  status TEXT NOT NULL CHECK (status IN ('approved', 'rejected')),
  decided_at TEXT NOT NULL,
  expires_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admission_review_statuses_status_expiry
ON admission_review_statuses(status, expires_at);

PRAGMA optimize;
