-- Discordのロール取得値（7期）より、本人が投稿内で明記した6期を優先する。
UPDATE discord_profile_snapshots
SET member_term = '第6期', imported_at = CURRENT_TIMESTAMP
WHERE discord_user_id = '1507605842629890231';

UPDATE members
SET member_term = '第6期', updated_at = CURRENT_TIMESTAMP
WHERE discord_user_id = '1507605842629890231' OR public_member_id = 'IRO0336';
