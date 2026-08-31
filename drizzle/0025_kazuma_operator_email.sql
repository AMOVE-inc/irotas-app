-- Keep the existing operator account and related history while correcting the login email.
UPDATE members
SET email = 'kazuma@e-eternal.com',
    updated_at = CURRENT_TIMESTAMP
WHERE discord_user_id = '1228677950401151139'
  AND email = 'eguchi.work0419@gmail.com'
  AND NOT EXISTS (
    SELECT 1
    FROM members AS existing
    WHERE existing.email = 'kazuma@e-eternal.com'
      AND existing.id <> members.id
  );

UPDATE member_subscriptions
SET billing_email = 'kazuma@e-eternal.com',
    updated_at = CURRENT_TIMESTAMP
WHERE billing_email = 'eguchi.work0419@gmail.com'
  AND NOT EXISTS (
    SELECT 1
    FROM member_subscriptions AS existing
    WHERE existing.billing_email = 'kazuma@e-eternal.com'
      AND existing.id <> member_subscriptions.id
  );

-- Old-address setup/reset codes must not remain usable after the address changes.
DELETE FROM email_verification_codes
WHERE email = 'eguchi.work0419@gmail.com'
  AND consumed_at IS NULL;
