-- IRO0542 completed the current seventh-term Square subscription, but the
-- discovery path previously created the member before copying the cohort.
UPDATE members
SET member_term = '第7期', updated_at = CURRENT_TIMESTAMP
WHERE LOWER(TRIM(email)) = 'info@amove-inc.com'
  AND public_member_id = 'IRO0542'
  AND (member_term IS NULL OR TRIM(member_term) = '');
