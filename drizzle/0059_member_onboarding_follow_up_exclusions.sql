ALTER TABLE member_onboarding_followups
  ADD COLUMN excluded_from_follow_up INTEGER NOT NULL DEFAULT 0 CHECK (excluded_from_follow_up IN (0, 1));
