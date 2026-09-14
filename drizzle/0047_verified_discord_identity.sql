-- One-time repair of an email login whose verified Discord identity was not
-- present in the billing-email import. Never take an ID already linked to
-- another member or overwrite a different ID on the target account.
INSERT INTO discord_profile_snapshots
  (discord_user_id, display_name, avatar_url, bio, has_profile_bio,
   discord_joined_at, discord_roles_json, member_term, member_rank, imported_at)
VALUES (
  '1452696559845113987',
  'きょういち',
  'https://cdn.discordapp.com/avatars/1452696559845113987/2e8c21f252909440cbb9926b08095889.png?size=512',
  '名前：きょういち
年齢：24
在住：東京都
出身：香川
職業：会社員（金融）
趣味：グルメ、Netflix、読書、家電探し

■コミュニティでやりたいこと
同年代で食が好きな方とお話してみたかったので、ぜひ皆さんと美味しいお店をたくさん開拓したいです！

■一言
7期生として参加させていただきました！
大学生の頃から食べログのランキング上位のお店を巡るのが趣味で、今は週3〜4回外食しています🍴
東京は3年目でまだまだ開拓中なので、色々教えていただけると嬉しいです！
よろしくお願いします！',
  1,
  '2026-08-30T13:34:13.584000Z',
  '["第7期メンバー", "レギュラー会員", "関東支部"]',
  '第7期',
  'regular',
  CURRENT_TIMESTAMP
)
ON CONFLICT(discord_user_id) DO NOTHING;

UPDATE members SET
  discord_user_id = '1452696559845113987',
  display_name = CASE WHEN display_name = '' OR display_name = substr(email, 1, instr(email, '@') - 1)
    THEN (SELECT display_name FROM discord_profile_snapshots WHERE discord_user_id = '1452696559845113987') ELSE display_name END,
  member_term = COALESCE((SELECT member_term FROM discord_profile_snapshots WHERE discord_user_id = '1452696559845113987'), member_term),
  member_rank = COALESCE((SELECT member_rank FROM discord_profile_snapshots WHERE discord_user_id = '1452696559845113987'), member_rank),
  discord_roles_json = COALESCE((SELECT discord_roles_json FROM discord_profile_snapshots WHERE discord_user_id = '1452696559845113987'), discord_roles_json),
  discord_joined_at = COALESCE((SELECT discord_joined_at FROM discord_profile_snapshots WHERE discord_user_id = '1452696559845113987'), discord_joined_at),
  profile_json = json_set(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END,
    '$.bio', CASE WHEN COALESCE(json_extract(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END, '$.bio'), '') = ''
      THEN (SELECT bio FROM discord_profile_snapshots WHERE discord_user_id = '1452696559845113987')
      ELSE json_extract(profile_json, '$.bio') END,
    '$.avatarUrl', CASE WHEN COALESCE(json_extract(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END, '$.avatarUrl'), '') = ''
      THEN (SELECT avatar_url FROM discord_profile_snapshots WHERE discord_user_id = '1452696559845113987')
      ELSE json_extract(profile_json, '$.avatarUrl') END),
  updated_at = CURRENT_TIMESTAMP
WHERE LOWER(TRIM(email)) = 'takedakyoichi0926@gmail.com'
  AND (discord_user_id IS NULL OR discord_user_id = '1452696559845113987')
  AND NOT EXISTS (SELECT 1 FROM members AS owner
    WHERE owner.discord_user_id = '1452696559845113987' AND owner.id <> members.id);

INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
SELECT NULL, 'member.discord_identity_linked', 'member', CAST(id AS TEXT),
  json_object('discordUserId', '1452696559845113987', 'source', '0047_verified_discord_identity'), CURRENT_TIMESTAMP
FROM members WHERE LOWER(TRIM(email)) = 'takedakyoichi0926@gmail.com' AND discord_user_id = '1452696559845113987';
