CREATE TABLE IF NOT EXISTS member_onboarding_followups (
  billing_email TEXT PRIMARY KEY COLLATE NOCASE,
  outreach_status TEXT NOT NULL DEFAULT 'not_sent' CHECK (outreach_status IN ('not_sent', 'sent', 'follow_up')),
  sent_at TEXT,
  last_contact_at TEXT,
  next_follow_up_at TEXT,
  owner_name TEXT NOT NULL DEFAULT '',
  issue_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
