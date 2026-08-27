ALTER TABLE account_deletion_requests ADD COLUMN request_type TEXT NOT NULL DEFAULT 'withdrawal' CHECK (request_type IN ('pause', 'withdrawal'));
ALTER TABLE account_deletion_requests ADD COLUMN survey_json TEXT;
ALTER TABLE account_deletion_requests ADD COLUMN square_action TEXT;
ALTER TABLE account_deletion_requests ADD COLUMN square_effective_date TEXT;

UPDATE system_metadata
SET value = '23', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
