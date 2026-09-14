-- Square Checkoutの注文とイベント参加者を、端末に依存しない共有DBで対応づける。
CREATE TABLE IF NOT EXISTS event_payment_checkouts (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  item_name TEXT NOT NULL,
  amount_yen INTEGER NOT NULL CHECK (amount_yen > 0),
  points_used INTEGER NOT NULL DEFAULT 0 CHECK (points_used >= 0),
  status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'ready', 'paid', 'cancelled')),
  square_payment_link_id TEXT,
  square_order_id TEXT UNIQUE,
  square_payment_id TEXT UNIQUE,
  checkout_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  cancelled_at TEXT,
  UNIQUE(event_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_event_payment_checkouts_event_status
ON event_payment_checkouts(event_id, status);
