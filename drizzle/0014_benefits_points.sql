CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  discount TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  code TEXT NOT NULL,
  required_rank TEXT NOT NULL DEFAULT 'regular' CHECK(required_rank IN ('regular', 'silver', 'gold', 'platinum')),
  usage_type TEXT NOT NULL DEFAULT 'single' CHECK(usage_type IN ('single', 'multiple')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'ended')),
  image_url TEXT,
  recipient_ids_json TEXT NOT NULL DEFAULT '[]',
  source_contest_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS coupon_usages (
  coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  use_count INTEGER NOT NULL DEFAULT 0 CHECK(use_count >= 0),
  last_presented_at TEXT,
  used_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(coupon_id, member_id)
);

CREATE TABLE IF NOT EXISTS gift_campaigns (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK(category IN ('gourmet', 'non_gourmet')),
  minimum_rank TEXT NOT NULL DEFAULT 'regular' CHECK(minimum_rank IN ('regular', 'silver', 'gold', 'platinum')),
  winner_count INTEGER NOT NULL DEFAULT 1 CHECK(winner_count > 0),
  deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  image_emoji TEXT NOT NULL DEFAULT '🎁',
  image_url TEXT,
  archived_from_discord INTEGER NOT NULL DEFAULT 0 CHECK(archived_from_discord IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS gift_applications (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES gift_campaigns(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  result TEXT NOT NULL DEFAULT 'pending' CHECK(result IN ('pending', 'winner', 'not_selected')),
  decided_at TEXT,
  UNIQUE(campaign_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_gift_applications_campaign
ON gift_applications(campaign_id, result, applied_at);

CREATE TABLE IF NOT EXISTS irotas_point_balances (
  member_id INTEGER PRIMARY KEY NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS irotas_point_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  actor_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL CHECK(amount != 0),
  balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS irotas_point_operation_requests (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  actor_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL CHECK(amount != 0),
  reason TEXT NOT NULL,
  balance_before INTEGER NOT NULL CHECK(balance_before >= 0),
  balance_after INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'applied', 'rejected')),
  transaction_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_irotas_point_transactions_member
ON irotas_point_transactions(member_id, created_at DESC);

INSERT OR IGNORE INTO coupons
  (id, title, description, discount, expires_at, code, required_rank, usage_type, status, image_url)
VALUES
  ('c1', '焼肉 罪と罰 10%OFF', 'IRO＋会員限定！お会計から10%割引', '10%OFF', '2026-06-30', 'IROPLUS2026', 'regular', 'single', 'active', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=600&fit=crop'),
  ('c2', '鮨 静龍苑 ドリンク1杯無料', 'シルバー会員以上限定。お好きなドリンク1杯サービス', 'ドリンク1杯無料', '2026-05-31', 'IROSILVER2026', 'silver', 'multiple', 'active', 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&h=600&fit=crop'),
  ('c3', 'ゴールド限定 コース10%OFF', 'ゴールド会員以上限定の特別割引', 'コース10%OFF', '2026-08-31', 'IROGOLD2026', 'gold', 'single', 'active', 'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?w=600&h=600&fit=crop'),
  ('c4', 'プラチナ限定 特別コース招待', 'プラチナ会員限定の特別コースにご招待', '特別コース', '2026-12-31', 'IROPLAT2026', 'platinum', 'multiple', 'active', 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=600&fit=crop');

INSERT OR IGNORE INTO gift_campaigns
  (id, title, description, category, minimum_rank, winner_count, deadline, status, image_emoji, image_url)
VALUES
  ('g1', '高級レストラン ペアディナー券', '都内レストランのペアディナーへご招待します。', 'gourmet', 'gold', 3, '2026-08-31', 'open', '🍽️', 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=600&fit=crop'),
  ('g2', 'ソムリエ厳選ワインセット', '厳選したワイン3本セットをプレゼントします。', 'gourmet', 'silver', 5, '2026-08-25', 'open', '🍷', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&h=600&fit=crop'),
  ('g3', 'IRO+ オリジナルグッズ', 'トートバッグとタンブラーのセットです。', 'non_gourmet', 'regular', 10, '2026-08-20', 'closed', '🎁', 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&h=600&fit=crop'),
  ('g4', '温泉旅行ペアチケット', '1泊2日の温泉旅行をプレゼントします。', 'non_gourmet', 'platinum', 1, '2026-07-31', 'closed', '♨️', 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=600&h=600&fit=crop');

UPDATE system_metadata
SET value = '15', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
