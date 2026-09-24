ALTER TABLE members ADD COLUMN user_handle TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_user_handle_unique
ON members(LOWER(user_handle))
WHERE user_handle IS NOT NULL AND TRIM(user_handle) <> '';

PRAGMA optimize;
