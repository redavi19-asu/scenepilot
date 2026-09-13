CREATE TABLE IF NOT EXISTS apple_subscriptions (
  user_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  original_transaction_id TEXT NOT NULL UNIQUE,
  latest_transaction_id TEXT NOT NULL,
  app_account_token TEXT,
  environment TEXT NOT NULL DEFAULT '',
  purchase_date INTEGER,
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  last_verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS apple_subscriptions_original_transaction_idx
  ON apple_subscriptions(original_transaction_id);

CREATE INDEX IF NOT EXISTS apple_subscriptions_latest_transaction_idx
  ON apple_subscriptions(latest_transaction_id);

CREATE INDEX IF NOT EXISTS apple_subscriptions_expires_idx
  ON apple_subscriptions(expires_at);
