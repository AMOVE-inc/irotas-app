-- Reconcile active members created from Square email-only login with their verified Discord identities.
-- Evidence: admission email/handle, live Discord username/unique active 7th-term display name,
-- and the current Discord role snapshot captured on 2026-09-20.
CREATE TABLE IF NOT EXISTS discord_identity_claims (
  email TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  bio TEXT NOT NULL,
  has_profile_bio INTEGER NOT NULL,
  discord_joined_at TEXT,
  discord_roles_json TEXT NOT NULL,
  member_term TEXT,
  member_rank TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'admin_verified',
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at TEXT
);

INSERT OR REPLACE INTO discord_identity_claims
  (email, discord_user_id, display_name, avatar_url, bio, has_profile_bio,
   discord_joined_at, discord_roles_json, member_term, member_rank)
VALUES
  ('mykmmmm@gmail.com','1540341083819741194','Miyako','https://cdn.discordapp.com/avatars/1540341083819741194/d0584a5c07f1e4e32a87e997a7db880c.png?size=512','名前：みやこ
年齢：33
在住：東京 
出身：徳島
職業：会社員（PR）
趣味：ワイン、トレーニング、美味しいお店開拓

■コミュニティでやりたいこと
皆さんと色々なお店を開拓したいです！
美味しいものを一緒に楽しみながら、交友関係も広げられたら嬉しいです☺️

■一言
7期生として参加させていただきました！
美味しいごはんやお酒が大好きで、特にビストロが好きです！ 最近はワインも好きで、少しずつ勉強しています🍷

色々な方とお話しできるのを楽しみにしています✨
よろしくお願いします！',1,'2026-08-21T12:49:26.746000+00:00','["レギュラー会員","第7期メンバー"]','第7期','regular'),
  ('22da0921@gmail.com','1541824681089175663','ツチダ','https://cdn.discordapp.com/avatars/1541824681089175663/91d170df404a5dfba22140e5cbb11ef8.png?size=512','名前：ツチダ
年齢：33歳
出身：京都
在住：東京
職業：営業マネージャー
趣味：カラオケ

■コミュニティでやりたいこと
東京に引っ越しできたばっかりなので美味しいお店を開拓したいです！

■一言
はじめまして！東京に引っ越しできたばかりで土地勘もない状況ですが、美味しいお店を開拓したいと思っています！
特にお肉が好きなのでみなさんとご一緒できたら嬉しいです！',1,'2026-08-25T15:01:58.004000+00:00','["レギュラー会員","第7期メンバー"]','第7期','regular'),
  ('seeah1128@gmail.com','1547614225550147606','星愛','https://cdn.discordapp.com/avatars/1547614225550147606/088e22a4c87791abdc805d1bbab65113.png?size=512','名前：せいあ
年齢：30
在住：神奈川
出身：大阪
職業：会社員(広告・マーケティング)
趣味：ドラマ鑑賞・グルメ・ワイン・陸上観戦

■コミュニティでやりたいこと
色んな職種の方とお酒や美味しい料理を食べながら楽しく話したいです🍽️🫶

■一言
東京に住んでいましたが、最近横浜に引越しました！
東京でも横浜でも、それ以外でも美味しいお店開拓したいのと、関東に友達が少なく、友達を増やしたくて入会しました🧚‍♀️
お酒を飲むこと、美味しいもの食べるの大好きです🥰
色んな方と仲良くなれたら嬉しいです☺️
よろしくお願いします🐻🤍',1,'2026-09-10T14:30:15.311000+00:00','["レギュラー会員","昼飲み部🍺","第7期メンバー"]','第7期','regular'),
  ('yukikosaka0501@gmail.com','1539976109805011026','ゆうき','https://cdn.discordapp.com/avatars/1539976109805011026/881ff5440d903d5ad2eb9164a5a894b4.png?size=512','名前：ゆうき
年齢：32
在住：東京
職業：会社員
趣味：グルメ開拓、ワイン、他たくさん

■コミュニティでやりたいこと

グルメ開拓とその仲間づくり！
そこまで高くないワイン方面のお店が今は得意です。

■一言
はじめまして、7期のゆうきです！

東京銀座新橋、神楽坂が得意エリアで、よく居ます。

これから皆さんとご一緒できるのを楽しみにしています！',1,'2026-08-20T12:39:05.796000+00:00','["レギュラー会員","散歩部🚶","昼飲み部🍺","肉部🍖","第7期メンバー","料理教室部🍳","旅行部✈️"]','第7期','regular'),
  ('nanri.1202@gmail.com','825745896548335676','ayumi','https://cdn.discordapp.com/avatars/825745896548335676/d36c16064529bd992f9be2fe42c5c42a.png?size=512','',0,'2026-08-28T09:41:13.464000+00:00','["レギュラー会員","昼飲み部🍺","肉部🍖","第7期メンバー","ワイン部🍷"]','第7期','regular'),
  ('dwarf.pufferfish@gmail.com','1544199653430530128','えりな','https://cdn.discordapp.com/avatars/1544199653430530128/d56a46448e5f20f46302b2567bdab7f3.png?size=512','名前：えりな
年齢：32歲
在住：東京都
出身：東京都
職業：製薬会社
趣味：食べること、旅行、ディズニー、Netflix
■コミュニティでやりたいこと
自分では知らなかったお店に行けたら嬉しいです☺️

■一言
人見知りが激しいのですが
食べるのは大好きなので、どうぞよろしくお願いします！',1,'2026-09-01T04:20:00.806000+00:00','["レギュラー会員","第7期メンバー"]','第7期','regular'),
  ('asagonkitsune@gmail.com','1541751597095460951','Mao','https://cdn.discordapp.com/avatars/1541751597095460951/9660391eba89798f2a1c1ac1adacea8d.png?size=512','名前：まお
年齢：25歳
在住：東京都
出身：滋賀県
職業：助産師
趣味：食べること、お酒🍷、写真を撮る、水泳、などなど

■コミュニティでやりたいこと
普段出会えない方々と食を通して交流したいです！🦞

■一言
はじめまして！
美味しいお酒とご飯を一緒に楽しめるような出会いにワクワクしております‼︎
よろしくお願いします🤍',1,'2026-08-26T00:34:01.048000+00:00','["レギュラー会員","第7期メンバー"]','第7期','regular'),
  ('mai.mai.sakuranbo@gmail.com','1079683949523107900','まい','https://cdn.discordapp.com/avatars/1079683949523107900/fe33e38ef8ad5b4321ad861af050ce43.png?size=512','名前：まい
年齢：30代
在住：東京 
出身：埼玉
職業：会社員
趣味：旅行、ドラマ

■コミュニティでやりたいこと
交友関係を広げながら、美味しいご飯を食べたり、楽しく過ごしたいです！

■一言
お友達の紹介で入会しました！
たくさんお会いしてお話できたら嬉しいです！☺️
お酒も好きなので、皆さんと楽しみたいです！
よろしくお願いします！',1,'2026-09-02T04:02:20.171000+00:00','["レギュラー会員","昼飲み部🍺","第7期メンバー"]','第7期','regular'),
  ('moekok1216@gmail.com','1543479919613313039','モエコ','https://cdn.discordapp.com/avatars/1543479919613313039/b962e88778e492d731039ba45f750211.png?size=512','名前：モエコ
年齢：25
在住：東京
出身：東京
職業：会社員(出版)
趣味：旅行、舞台鑑賞、美味しい食べもの・お酒を探すこと

■コミュニティでやりたいこと
グルメな皆さんと、素敵なお店や手土産の情報を交換したいです！

■一言
居酒屋さんからパティスリーまで、色々なお店を開拓できたらなと思っています♪
これからどうぞよろしくお願いします！',1,'2026-08-30T04:47:52.719000+00:00','["レギュラー会員","肉部🍖","スイーツ部🍰","第7期メンバー"]','第7期','regular'),
  ('honoka0928.a0402@gmail.com','1544527166962794591','honoka','https://cdn.discordapp.com/avatars/1544527166962794591/7a1f4431ec95eac6e98d2c5e0b82b3fe.png?size=512','',0,'2026-09-02T02:02:32.824000+00:00','["レギュラー会員","第7期メンバー"]','第7期','regular'),
  ('maika.y@docomo.ne.jp','1547113768889090132','まいか','','',0,'2026-09-09T05:20:28.745000+00:00','["レギュラー会員","第7期メンバー"]','第7期','regular');

INSERT INTO discord_profile_snapshots
  (discord_user_id, display_name, avatar_url, bio, has_profile_bio, discord_joined_at,
   discord_roles_json, member_term, member_rank, imported_at)
SELECT discord_user_id, display_name, avatar_url, bio, has_profile_bio, discord_joined_at,
       discord_roles_json, member_term, member_rank, CURRENT_TIMESTAMP
FROM discord_identity_claims
WHERE 1
ON CONFLICT(discord_user_id) DO UPDATE SET
  display_name = excluded.display_name,
  avatar_url = excluded.avatar_url,
  bio = excluded.bio,
  has_profile_bio = excluded.has_profile_bio,
  discord_joined_at = excluded.discord_joined_at,
  discord_roles_json = excluded.discord_roles_json,
  member_term = excluded.member_term,
  member_rank = excluded.member_rank,
  imported_at = excluded.imported_at;

UPDATE members
SET discord_user_id = (SELECT v.discord_user_id FROM discord_identity_claims v WHERE LOWER(v.email) = LOWER(members.email)),
    display_name = CASE
      WHEN display_name = '' OR LOWER(display_name) = LOWER(substr(email, 1, instr(email, '@') - 1))
      THEN (SELECT v.display_name FROM discord_identity_claims v WHERE LOWER(v.email) = LOWER(members.email))
      ELSE display_name END,
    member_term = COALESCE((SELECT v.member_term FROM discord_identity_claims v WHERE LOWER(v.email) = LOWER(members.email)), member_term),
    member_rank = COALESCE((SELECT v.member_rank FROM discord_identity_claims v WHERE LOWER(v.email) = LOWER(members.email)), member_rank),
    discord_roles_json = COALESCE((SELECT v.discord_roles_json FROM discord_identity_claims v WHERE LOWER(v.email) = LOWER(members.email)), discord_roles_json),
    discord_joined_at = COALESCE((SELECT v.discord_joined_at FROM discord_identity_claims v WHERE LOWER(v.email) = LOWER(members.email)), discord_joined_at),
    profile_json = json_set(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END,
      '$.bio', CASE WHEN COALESCE(json_extract(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END, '$.bio'), '') = ''
        THEN COALESCE((SELECT CASE WHEN v.has_profile_bio = 1 THEN v.bio ELSE '' END FROM discord_identity_claims v WHERE LOWER(v.email) = LOWER(members.email)), '')
        ELSE json_extract(profile_json, '$.bio') END,
      '$.avatarUrl', CASE WHEN COALESCE(json_extract(CASE WHEN json_valid(profile_json) THEN profile_json ELSE '{}' END, '$.avatarUrl'), '') = ''
        THEN COALESCE((SELECT v.avatar_url FROM discord_identity_claims v WHERE LOWER(v.email) = LOWER(members.email)), '')
        ELSE json_extract(profile_json, '$.avatarUrl') END),
    updated_at = CURRENT_TIMESTAMP
WHERE account_status = 'active'
  AND (discord_user_id IS NULL OR TRIM(discord_user_id) = '')
  AND EXISTS (SELECT 1 FROM discord_identity_claims v WHERE LOWER(v.email) = LOWER(members.email))
  AND NOT EXISTS (
    SELECT 1 FROM members owner
    JOIN discord_identity_claims v ON v.discord_user_id = owner.discord_user_id
    WHERE LOWER(v.email) = LOWER(members.email) AND owner.id <> members.id
  );

INSERT INTO club_memberships (club_id, member_id, status, source, applied_at, approved_at, updated_at)
SELECT c.id, m.id, 'approved', 'discord', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM discord_identity_claims v
JOIN members m ON LOWER(m.email) = LOWER(v.email) AND m.discord_user_id = v.discord_user_id
JOIN clubs c
CROSS JOIN json_each(CASE WHEN json_valid(v.discord_roles_json) THEN v.discord_roles_json ELSE '[]' END) role
WHERE CAST(role.value AS TEXT) LIKE '%' || c.name || '%'
ON CONFLICT(club_id, member_id) DO UPDATE SET
  status = 'approved', source = 'discord', approved_at = COALESCE(club_memberships.approved_at, excluded.approved_at),
  updated_at = excluded.updated_at;

INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
SELECT NULL, 'member.discord_identity_reconciled', 'member', CAST(m.id AS TEXT),
       json_object('discordUserId', m.discord_user_id, 'source', 'verified_2026-09-21_reconciliation'), CURRENT_TIMESTAMP
FROM members m JOIN discord_identity_claims v ON LOWER(v.email) = LOWER(m.email)
WHERE m.discord_user_id = v.discord_user_id
  AND NOT EXISTS (
    SELECT 1 FROM audit_logs a WHERE a.action = 'member.discord_identity_reconciled'
      AND a.entity_type = 'member' AND a.entity_id = CAST(m.id AS TEXT)
      AND json_extract(a.metadata_json, '$.source') = 'verified_2026-09-21_reconciliation'
  );

INSERT OR REPLACE INTO migration_runs
  (id, migration_type, source_filename, status, imported_count, skipped_count, error_count, summary_json, started_at, completed_at)
SELECT 'discord-identity-reconcile-20260921', 'discord_profiles', 'verified-discord-links-20260921', 'completed',
       COUNT(*), 0, 0, json_object('verifiedLinks', COUNT(*)), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM members m JOIN discord_identity_claims v ON LOWER(v.email) = LOWER(m.email) AND m.discord_user_id = v.discord_user_id;

UPDATE discord_identity_claims
SET consumed_at = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM members m
  WHERE LOWER(m.email) = LOWER(discord_identity_claims.email)
    AND m.discord_user_id = discord_identity_claims.discord_user_id
);
PRAGMA optimize;
