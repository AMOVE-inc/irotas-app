-- 2026-09-11 MEE6 to IRO+ XP cutover audit fields.
-- members.xp becomes the rounded IRO+ total at import time; the original
-- MEE6 snapshot remains available for reconciliation and rollback review.
ALTER TABLE members ADD COLUMN mee6_xp INTEGER;
ALTER TABLE members ADD COLUMN mee6_level INTEGER;
ALTER TABLE members ADD COLUMN mee6_imported_at TEXT;

UPDATE system_metadata
SET value = '25', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
