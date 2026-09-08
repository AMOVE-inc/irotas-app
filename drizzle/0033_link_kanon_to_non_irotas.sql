-- テスト用メールログインを Discord の Non【IRO+代表】へ統合する。
-- 既存の Discord 会員がある場合はその会員レコードを維持し、ログイン情報だけを移す。
UPDATE members
SET email = 'kanon1998915+legacy@icloud.invalid', updated_at = CURRENT_TIMESTAMP
WHERE email = 'kanon1998915@icloud.com'
  AND EXISTS (SELECT 1 FROM members WHERE discord_user_id = '1119606639763390545');

UPDATE members
SET email = 'kanon1998915@icloud.com',
    password_hash = COALESCE((SELECT password_hash FROM members WHERE email = 'kanon1998915+legacy@icloud.invalid'), password_hash),
    password_set_at = COALESCE((SELECT password_set_at FROM members WHERE email = 'kanon1998915+legacy@icloud.invalid'), password_set_at),
    display_name = 'Non【IRO+代表】', role = 'admin', access_role = 'admin',
    updated_at = CURRENT_TIMESTAMP
WHERE discord_user_id = '1119606639763390545';

UPDATE member_subscriptions
SET member_id = (SELECT id FROM members WHERE discord_user_id = '1119606639763390545'),
    updated_at = CURRENT_TIMESTAMP
WHERE billing_email = 'kanon1998915@icloud.com'
  AND EXISTS (SELECT 1 FROM members WHERE discord_user_id = '1119606639763390545');

-- Discord 会員が未取り込みの環境では、既存テスト会員をそのまま代表アカウントに昇格する。
UPDATE members
SET display_name = 'Non【IRO+代表】', discord_user_id = '1119606639763390545',
    role = 'admin', access_role = 'admin',
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'kanon1998915@icloud.com'
  AND NOT EXISTS (SELECT 1 FROM members WHERE discord_user_id = '1119606639763390545');

UPDATE system_metadata SET value = '33', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
