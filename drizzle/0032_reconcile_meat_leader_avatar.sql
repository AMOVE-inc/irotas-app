-- Discord-only meat club leader: retain the Discord identity and avatar in the app profile.
UPDATE members
SET discord_user_id = '1530052808651309169',
    display_name = 'はぎーちゃん🍖肉部長',
    access_role = 'club_leader',
    profile_json = json_set(
      CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END,
      '$.avatarUrl', 'https://cdn.discordapp.com/avatars/1530052808651309169/18268de99ba9a54fb8f90e9ba3d9acaf.png?size=512'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'haaaagichan.groumet@gmail.com';

UPDATE clubs
SET leader_member_id = (SELECT id FROM members WHERE email = 'haaaagichan.groumet@gmail.com' LIMIT 1),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'club-meat';

UPDATE system_metadata SET value = '32', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
